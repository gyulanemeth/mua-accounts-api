import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import jwt from 'jsonwebtoken'
import handlebars from 'handlebars'

import { list, readOne, patchOne, createOne } from 'mongoose-crudl'
import { MethodNotAllowedError, ValidationError } from 'standard-api-errors'
import allowAccessTo from 'bearer-jwt-auth'

import AccountModel from '../models/Account.js'
import UserModel from '../models/User.js'
import sendEmail from '../helpers/sendEmail.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const Invitation = fs.readFileSync(path.join(__dirname, '..', 'email-templates', 'invitation.html'), 'utf8')

const secrets = process.env.SECRETS.split(' ')

export default (apiServer) => {

  apiServer.post('/v1/accounts/:id/invitation/send', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user', role: 'admin' }])
    const checkAccount = await readOne(AccountModel, { id: req.params.id }, req.query)

    const checkUser = await list(UserModel, { email: req.body.email, accountId: req.params.id }, req.query)
    if (checkUser.result.count !== 0) {
      throw new MethodNotAllowedError('User exist')
    }
    const newUser = await createOne(UserModel, req.params, { email: req.body.email, accountId: req.params.id })
    const payload = {
      type: 'invitation',
      user: {
        _id: newUser.result._id,
        email: newUser.result.email
      },
      account: {
        _id: checkAccount.result._id,
        urlFriendlyName: checkAccount.result.urlFriendlyName
      }
    }
    const token = jwt.sign(payload, secrets[0])
    const template = handlebars.compile(Invitation)
    const html = template({ token })
    const info = await sendEmail(newUser.result.email, 'invitation link ', html)
    return {
      status: 201,
      result: {
        success: true,
        info: info.result.info
      }
    }
  })

  apiServer.post('/v1/accounts/:id/invitation/accept', async req => {
    const data = allowAccessTo(req, secrets, [{ type: 'invitation', account: { _id: req.params.id } }])

    const user = await readOne(UserModel, { id: data.user._id, email: data.user.email, accountId: req.params.id }, req.query)

    if (user.result.password) {
      throw new MethodNotAllowedError('User already has a password')
    }
    if (req.body.newPassword !== req.body.newPasswordAgain) { // check password matching
      throw new ValidationError("Validation error passwords didn't match ")
    }
    const hash = crypto.createHash('md5').update(req.body.newPassword).digest('hex')
    const updatedUser = await patchOne(UserModel, { id: data.user._id }, { password: hash })
    const payload = {
      type: 'login',
      user: {
        _id: updatedUser.result._id,
        email: updatedUser.result.email,
        accountId: updatedUser.result.accountId
      }
    }
    const token = jwt.sign(payload, secrets[0])
    return {
      status: 200,
      result: {
        loginToken: token
      }
    }
  })
}
