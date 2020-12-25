const express = require('express');
const relayController = require('../controllers/relay');

module.exports = (context) => {
  let router = express.Router();
  router.get('/', relayController.getStreams.bind(context));
  router.get('/list', relayController.getStreamList.bind(context));
  router.post('/pull', relayController.pullStream.bind(context));
  router.post('/push', relayController.pushStream.bind(context));
  router.post('/push/custom', relayController.pushStreamCustom.bind(context));
  router.delete('/:id', relayController.stopStream.bind(context));
  return router;
};
