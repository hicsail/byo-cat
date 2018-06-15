'use strict';
const AuthPlugin = require('../auth');
const Boom = require('boom');
const Joi = require('joi');


const internals = {};


internals.applyRoutes = function (server, next) {

  const User = server.plugins['hapi-mongo-models'].User;


  server.route({
    method: 'GET',
    path: '/users',
    config: {
      auth: {
         strategy: 'session',
        scope: 'admin'
      },
      validate: {
        query: {
          username: Joi.string().token().lowercase(),
          isActive: Joi.string(),
          role: Joi.string(),
          fields: Joi.string(),
          sort: Joi.string().default('_id'),
          limit: Joi.number().default(20),
          page: Joi.number().default(1)
        }
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root')
      ]
    },
    handler: function (request, reply) {

      const query = {};
      if (request.query.username) {
        query.username = new RegExp('^.*?' + request.query.username + '.*$', 'i');
      }
      if (request.query.isActive) {
        query.isActive = request.query.isActive === 'true';
      }
      if (request.query.role) {
        query['roles.' + request.query.role] = { $exists: true };
      }
      const fields = request.query.fields;
      const sort = request.query.sort;
      const limit = request.query.limit;
      const page = request.query.page;

      User.pagedFind(query, fields, sort, limit, page, (err, results) => {

        if (err) {
          return reply(err);
        }

        reply(results);
      });
    }
  });


  server.route({
    method: 'GET',
    path: '/users/{id}',
    config: {
      auth: {
         strategy: 'session',
        scope: 'admin'
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root')
      ]
    },
    handler: function (request, reply) {

      User.findById(request.params.id, (err, user) => {

        if (err) {
          return reply(err);
        }

        if (!user) {
          return reply(Boom.notFound(request.l10n.gettext("Document not found.")));
        }

        reply(user);
      });
    }
  });


  server.route({
    method: 'GET',
    path: '/users/my',
    config: {
      auth: {
         strategy: 'session',
        scope: ['admin', 'account']
      }
    },
    handler: function (request, reply) {

      const id = request.auth.credentials.user._id.toString();
      const fields = User.fieldsAdapter('username roles');

      User.findById(id, fields, (err, user) => {

        if (err) {
          return reply(err);
        }

        if (!user) {
          return reply(Boom.notFound(request.l10n.gettext("Document not found. That is strange.")));
        }

        reply(user);
      });
    }
  });


  server.route({
    method: 'POST',
    path: '/users',
    config: {
      auth: {
         strategy: 'session',
        scope: 'admin'
      },
      validate: {
        payload: {
          username: Joi.string().token().lowercase().required(),
          password: Joi.string().min(10).required(),
        }
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root'),
        {
          assign: 'usernameCheck',
          method: function (request, reply) {

            const conditions = {
              username: request.payload.username
            };

            User.findOne(conditions, (err, user) => {

              if (err) {
                return reply(err);
              }

              if (user) {
                return reply(Boom.conflict(request.l10n.gettext("Username already in use.")));
              }

              reply(true);
            });
          }
        },
        {
          assign: 'passwordValidation',
          method: function (request, reply) {
            Joi.validate(request.payload.password, new PasswordComplexity(complexityOptions), (err, value) => {
              console.error(err);
              if (err) {
                return reply(Boom.badRequest(request.l10n.gettext("Password does not meet complexity rules.")));
              }

              reply(true);
            });
          }
        }
      ]
    },
    handler: function (request, reply) {

      const username = request.payload.username;
      const password = request.payload.password;

      User.create(username, password,  (err, user) => {

        if (err) {
          return reply(err);
        }

        reply(user);
      });
    }
  });


  server.route({
    method: 'PUT',
    path: '/users/{id}',
    config: {
      auth: {
         strategy: 'session',
        scope: 'admin'
      },
      validate: {
        params: {
          id: Joi.string().invalid('000000000000000000000000')
        },
        payload: {
          isActive: Joi.boolean().required(),
          username: Joi.string().token().lowercase().required(),
        }
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root'),
        {
          assign: 'usernameCheck',
          method: function (request, reply) {

            const conditions = {
              username: request.payload.username,
              _id: { $ne: User._idClass(request.params.id) }
            };

            User.findOne(conditions, (err, user) => {

              if (err) {
                return reply(err);
              }

              if (user) {
                return reply(Boom.conflict(request.l10n.gettext("Username already in use.")));
              }

              reply(true);
            });
          }
        }
      ]
    },
    handler: function (request, reply) {

      const id = request.params.id;
      const update = {
        $set: {
          isActive: request.payload.isActive,
          username: request.payload.username
        }
      };

      User.findByIdAndUpdate(id, update, (err, user) => {

        if (err) {
          return reply(err);
        }

        if (!user) {
          return reply(Boom.notFound(request.l10n.gettext("Document not found.")));
        }

        reply(user);
      });
    }
  });


  server.route({
    method: 'PUT',
    path: '/users/my',
    config: {
      auth: {
         strategy: 'session',
        scope: ['admin', 'account']
      },
      validate: {
        payload: {
          username: Joi.string().token().lowercase().required()
        }
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root'),
        {
          assign: 'usernameCheck',
          method: function (request, reply) {

            const conditions = {
              username: request.payload.username,
              _id: { $ne: request.auth.credentials.user._id }
            };

            User.findOne(conditions, (err, user) => {

              if (err) {
                return reply(err);
              }

              if (user) {
                return reply(Boom.conflict(request.l10n.gettext("Username already in use.")));
              }

              reply(true);
            });
          }
        }
      ]
    },
    handler: function (request, reply) {

      const id = request.auth.credentials.user._id.toString();
      const update = {
        $set: {
          username: request.payload.username
        }
      };
      const findOptions = {
        fields: User.fieldsAdapter('username roles')
      };

      User.findByIdAndUpdate(id, update, findOptions, (err, user) => {

        if (err) {
          return reply(err);
        }

        reply(user);
      });
    }
  });


  server.route({
    method: 'PUT',
    path: '/users/{id}/password',
    config: {
      auth: {
         strategy: 'session',
        scope: 'admin'
      },
      validate: {
        params: {
          id: Joi.string().invalid('000000000000000000000000')
        },
        payload: {
          password: Joi.string().required()
        }
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root'),
        {
          assign: 'password',
          method: function (request, reply) {

            User.generatePasswordHash(request.payload.password, (err, hash) => {

              if (err) {
                return reply(err);
              }

              reply(hash);
            });
          }
        }
      ]
    },
    handler: function (request, reply) {

      const id = request.params.id;
      const update = {
        $set: {
          password: request.pre.password.hash
        }
      };

      User.findByIdAndUpdate(id, update, (err, user) => {

        if (err) {
          return reply(err);
        }

        reply(user);
      });
    }
  });


  server.route({
    method: 'PUT',
    path: '/users/my/password',
    config: {
      auth: {
         strategy: 'session',
        scope: ['admin', 'account']
      },
      validate: {
        payload: {
          password: Joi.string().required()
        }
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root'),
        {
          assign: 'password',
          method: function (request, reply) {

            User.generatePasswordHash(request.payload.password, (err, hash) => {

              if (err) {
                return reply(err);
              }

              reply(hash);
            });
          }
        }
      ]
    },
    handler: function (request, reply) {

      const id = request.auth.credentials.user._id.toString();
      const update = {
        $set: {
          password: request.pre.password.hash
        }
      };
      const findOptions = {
        fields: User.fieldsAdapter('username')
      };

      User.findByIdAndUpdate(id, update, findOptions, (err, user) => {

        if (err) {
          return reply(err);
        }

        reply(user);
      });
    }
  });


  server.route({
    method: 'DELETE',
    path: '/users/{id}',
    config: {
      auth: {
         strategy: 'session',
        scope: 'admin'
      },
      validate: {
        params: {
          id: Joi.string().invalid('000000000000000000000000')
        }
      },
      pre: [
        AuthPlugin.preware.ensureAdminGroup('root')
      ]
    },
    handler: function (request, reply) {

      User.findByIdAndDelete(request.params.id, (err, user) => {

        if (err) {
          return reply(err);
        }

        if (!user) {
          return reply(Boom.notFound(request.l10n.gettext("Document not found.")));
        }

        reply({ message: 'Success.' });
      });
    }
  });


  next();
};


exports.register = function (server, options, next) {

  server.dependency(['auth', 'hapi-mongo-models'], internals.applyRoutes);

  next();
};


exports.register.attributes = {
  name: 'users'
};
