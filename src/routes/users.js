import { list, readOne, deleteOne, patchOne, createOne } from 'mongoose-crudl'

import allowAccessTo from 'bearer-jwt-auth'
import AccountModel from '../models/Account.js'
import UserModel from '../models/User.js'
import { MethodNotAllowedError, ValidationError } from 'standard-api-errors'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

export default (apiServer) => {
  const secrets = process.env.SECRETS.split(' ')

  apiServer.patch('/v1/accounts/:accountId/users/:id/name', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user', role: 'admin' }, { type: 'user', user: { _id: req.params.id } }])
    const user = await patchOne(UserModel, { id: req.params.id, accountId: req.params.accountId }, { name: req.body.name })
    return user
  })

  apiServer.patch('/v1/accounts/:accountId/users/:id/password', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user', role: 'admin' }, { type: 'user', user: { _id: req.params.id } }])
    if (req.body.password !== req.body.passwordAgain) {
      throw new ValidationError("Validation error passwords didn't match ")
    }
    const hash = crypto.createHash('md5').update(req.body.password).digest('hex')
    const user = await patchOne(UserModel, { id: req.params.id, accountId: req.params.accountId }, { password: hash })
    return user
  })

  apiServer.patch('/v1/accounts/:accountId/users/:id/role', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user', role: 'admin' }])

    const user = await readOne(UserModel, { id: req.params.id, accountId: req.params.accountId }, { select: { password: 0 } })
    if (user.result.role === 'admin') {
      const admin = await list(UserModel, { role: 'admin' }, { select: { password: 0 } })
      if (admin.result.count < 2) {
        throw new MethodNotAllowedError('Removing the last admin is not allowed')
      }
    }
    const updatedUser = await patchOne(UserModel, { id: req.params.id, accountId: req.params.accountId }, { role: req.body.role })
    return updatedUser
  })

  apiServer.delete('/v1/accounts/:accountId/users/:id', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user', role: 'admin' }])

    let user = await readOne(UserModel, { id: req.params.id, accountId: req.params.accountId })
    if (user.result.role === 'admin') {
      const admin = await list(UserModel, { role: 'admin' }, { select: { password: 0 } })
      if (admin.result.count < 2) {
        throw new MethodNotAllowedError('Removing the last admin is not allowed')
      }
    }
    user = await deleteOne(UserModel, { id: req.params.id, accountId: req.params.accountId }, req.query)
    return user
  })

  apiServer.get('/v1/accounts/:accountId/users/:id/access-token', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'login', user: { _id: req.params.id, accountId: req.params.accountId } }, { type: 'user', user: { _id: req.params.id, accountId: req.params.accountId } }])

    const findUser = await readOne(UserModel, { id: req.params.id, accountId: req.params.accountId }, { select: { password: 0 } })
    const getAccount = await readOne(AccountModel, { id: req.params.accountId }, req.query)

    const payload = {
      type: 'user',
      user: {
        _id: findUser.result._id,
        email: findUser.result.email
      },
      account: {
        _id: getAccount.result._id,
        urlFriendlyName: getAccount.result.urlFriendlyName
      },
      role: findUser.result.role
    }
    const token = jwt.sign(payload, secrets[0])
    return {
      status: 200,
      result: {
        accessToken: 'Bearer ' + token
      }
    }
  })

  apiServer.post('/v1/accounts/:accountId/users/:id/finalize-registration', async req => {
    const data = allowAccessTo(req, secrets, [{ type: 'registration', user: { _id: req.params.id, accountId: req.params.accountId } }])
    const user = await patchOne(UserModel, { id: data.user._id, accountId: req.params.accountId }, { role: 'admin' })
    return user
  })

  apiServer.get('/v1/accounts/:accountId/users', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user' }])
    await readOne(AccountModel, { id: req.params.accountId }, req.query)
    const userList = await list(UserModel, { accountId: req.params.accountId }, { select: { password: 0 } })
    return userList
  })

  apiServer.post('/v1/accounts/:accountId/users', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user' }])
    await readOne(AccountModel, { id: req.params.accountId }, req.query)

    const checkUser = await list(UserModel, { email: req.body.email, accountId: req.params.accountId }, { select: { password: 0 } })
    if (checkUser.result.count !== 0) {
      throw new MethodNotAllowedError('User exist')
    }
    const hash = crypto.createHash('md5').update(req.body.password).digest('hex')
    const newUser = await createOne(UserModel, req.params, { name: req.body.name, email: req.body.email, password: hash, accountId: req.params.accountId })

    return newUser
  })

  apiServer.get('/v1/accounts/:accountId/users/:id', async req => {
    allowAccessTo(req, secrets, [{ type: 'admin' }, { type: 'user' }])
    const user = await readOne(UserModel, { id: req.params.id, accountId: req.params.accountId }, { select: { password: 0 } })
    return user
  })
}
