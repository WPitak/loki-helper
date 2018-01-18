const Joi = require('joi')

const lokiID = Joi.number()
  .integer()
  .min(1)

const meta = Joi.object()
  .keys({
    revision: Joi.number(),
    created: Joi.date(),
    version: Joi.number(),
    updated: Joi.date()
  })
  .unknown()

const lokiObject = Joi.object()
  .keys({
    $loki: lokiID.required(),
    meta: meta.required()
  })
  .unknown()

module.exports.lokiID = lokiID
module.exports.lokiObject = lokiObject
