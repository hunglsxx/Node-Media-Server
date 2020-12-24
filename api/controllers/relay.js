//
//  Created by Mingliang Chen on 19/4/11.
//  illuspas[a]gmail.com
//  Copyright (c) 2019 Nodemedia. All rights reserved.
//
const _ = require('lodash');

function getStreams(req, res, next) {
  let stats = {};

  this.sessions.forEach(function (session, id) {
    if (session.constructor.name !== 'NodeRelaySession') {
      return;
    }

    let { app, name } = session.conf;

    if (!_.get(stats, [app, name])) {
      _.set(stats, [app, name], {
        relays: []
      });
    }

    _.set(stats, [app, name, 'relays'], {
      app: app,
      name: name,
      url: session.conf.ouPath,
      mode: session.conf.mode,
      id: session.id,
    });
  });

  res.json(stats);
}

function getStreamList(req, res, next) {
  let stats = [];
  this.sessions.forEach(function (session, id) {
    if (session.constructor.name !== 'NodeRelaySession') {
      return;
    }
    var item = { cfg: session.conf, id: session.id };
    stats.push(item);
  });

  res.json(stats);
}

function pullStream(req, res, next) {
  let url = req.body.url;
  let app = req.body.app;
  let name = req.body.name;
  if (url && app && name) {
    this.nodeEvent.emit('relayPull', url, app, name);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}

function pushStream(req, res, next) {
  let url = req.body.url;
  let app = req.body.app;
  let name = req.body.name;
  if (url && app && name) {
    this.nodeEvent.emit('relayPush', url, app, name);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}

function pushStaticStream(req, res, next) {
  let source = req.body.source;
  let destination = req.body.destination;
  let app = req.body.app;
  let name = req.body.name;

  if (!Array.isArray(destination)) {
    destination = [destination];
  }
  if (source && destination) {
    this.nodeEvent.emit('relayPushStatic', source, destination, app, name);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}

function pushDynamicStream(req, res, next) {
  let destination = req.body.destination;
  let app = req.body.app;
  let name = req.body.name;
  if (destination && app && name) {
    if (!Array.isArray(destination)) {
      destination = [destination];
    }
    this.nodeEvent.emit('relayPushDynamic', destination, app, name);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}

function stopStream(req, res, next) {
  var close = false;
  if (req.params.id) {
    this.sessions.forEach(function (session, id) {
      if (session.constructor.name !== 'NodeRelaySession') {
        return;
      }
      if (session.id == req.params.id) {
        session.end();
        return;
      }
    });
  }
  return res.json({ close });
}

module.exports = {
  getStreams,
  pullStream,
  pushStream,
  pushStaticStream,
  pushDynamicStream,
  stopStream,
  getStreamList
};
