//
//  Created by Mingliang Chen on 18/3/16.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const NodeCoreUtils = require('./node_core_utils');
const NodeRelaySession = require('./node_relay_session');
const context = require('./node_core_ctx');
const { getFFmpegVersion, getFFmpegUrl } = require('./node_core_utils');
const fs = require('fs');
const _ = require('lodash');
var axios = require('axios');

class NodeRelayServer {
  constructor(config) {
    this.config = config;
    this.staticCycle = null;
    this.staticSessions = new Map();
    this.dynamicSessions = new Map();
  }

  async run() {
    try {
      fs.accessSync(this.config.relay.ffmpeg, fs.constants.X_OK);
    } catch (error) {
      Logger.error(`Node Media Relay Server startup failed. ffmpeg:${this.config.relay.ffmpeg} cannot be executed.`);
      return;
    }

    let version = await getFFmpegVersion(this.config.relay.ffmpeg);
    if (version === '' || parseInt(version.split('.')[0]) < 4) {
      Logger.error('Node Media Relay Server startup failed. ffmpeg requires version 4.0.0 above');
      Logger.error('Download the latest ffmpeg static program:', getFFmpegUrl());
      return;
    }
    context.nodeEvent.on('relayPull', this.onRelayPull.bind(this));
    context.nodeEvent.on('relayPush', this.onRelayPush.bind(this));
    context.nodeEvent.on('relayPushCustom', this.onRelayPushCustom.bind(this));
    context.nodeEvent.on('prePlay', this.onPrePlay.bind(this));
    context.nodeEvent.on('donePlay', this.onDonePlay.bind(this));
    context.nodeEvent.on('postPublish', this.onPostPublish.bind(this));
    context.nodeEvent.on('donePublish', this.onDonePublish.bind(this));
    this.staticCycle = setInterval(this.onStatic.bind(this), 1000);
    Logger.log('Node Media Relay Server started');
  }

  onStatic() {
    if (!this.config.relay.tasks) {
      return;
    }
    let i = this.config.relay.tasks.length;
    while (i--) {
      if (this.staticSessions.has(i)) {
        continue;
      }

      let conf = this.config.relay.tasks[i];
      let isStatic = conf.mode === 'static';
      if (isStatic) {
        conf.name = conf.name ? conf.name : NodeCoreUtils.genRandomName();
        conf.ffmpeg = this.config.relay.ffmpeg;
        conf.inPath = conf.edge;
        conf.ouPath = `rtmp://127.0.0.1:${this.config.rtmp.port}/${conf.app}/${conf.name}`;
        let session = new NodeRelaySession(conf);
        session.id = i;
        session.streamPath = `/${conf.app}/${conf.name}`;
        session.on('end', (id) => {
          this.staticSessions.delete(id);
        });
        this.staticSessions.set(i, session);
        session.run();
        Logger.log('[Relay static pull] start', i, conf.inPath, ' to ', conf.ouPath);
      }
    }
  }

  //从远端拉推到本地
  onRelayPull(url, app, name) {
    let conf = {};
    conf.app = app;
    conf.name = name;
    conf.ffmpeg = this.config.relay.ffmpeg;
    conf.inPath = url;
    conf.ouPath = `rtmp://127.0.0.1:${this.config.rtmp.port}/${app}/${name}`;
    let session = new NodeRelaySession(conf);
    const id = session.id;
    context.sessions.set(id, session);
    session.on('end', (id) => {
      this.dynamicSessions.delete(id);
    });
    this.dynamicSessions.set(id, session);
    session.run();
    Logger.log('[Relay dynamic pull] start', id, conf.inPath, ' to ', conf.ouPath);
    return id;
  }

  //从本地拉推到远端
  onRelayPush(url, app, name) {
    let conf = {};
    conf.app = app;
    conf.name = name;
    conf.ffmpeg = this.config.relay.ffmpeg;
    conf.inPath = `rtmp://127.0.0.1:${this.config.rtmp.port}/${app}/${name}`;
    conf.ouPath = url;
    let session = new NodeRelaySession(conf);
    const id = session.id;
    context.sessions.set(id, session);
    session.on('end', (id) => {
      this.dynamicSessions.delete(id);
    });
    this.dynamicSessions.set(id, session);
    session.run();
    Logger.log('[Relay dynamic push] start', id, conf.inPath, ' to ', conf.ouPath);
  }

  onRelayPushCustom(source, destination, app, name, opts) {
    let conf = {};
    var isLoop = true;
    if(app && name) {
      conf.app = app;
      conf.name = name;
      source = `rtmp://127.0.0.1:${this.config.rtmp.port}/${app}/${name}`;
      isLoop = false;
    }
    conf.ffmpeg = this.config.relay.ffmpeg;
    conf.inPath = source;
    conf.ouPath = destination;
    conf.startTime = Date.now();
    if(this.config.callback) opts.callback = this.config.callback;
    conf.opts = opts;
    let session = new NodeRelaySession(conf);
    const id = session.id;
    context.sessions.set(id, session);
    session.on('end', (id) => {
      this.dynamicSessions.delete(id);
    });
    this.dynamicSessions.set(id, session);
    session.runCustom(isLoop);
    Logger.log('[Relay dynamic push] start', id, conf.inPath, ' to ', conf.ouPath);
    if(this.config.callback 
        && this.config.callback.api 
        && this.config.callback.update_relay_id_endpoint) {

      var url = `${this.config.callback.api}/${this.config.callback.update_relay_id_endpoint}/${opts.customRelay}/${id}`;
      axios({
        method: 'PATCH',
        url: url,
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        data : {}
      }).then(function (response) {
        Logger.log('[Updated session id]:', id, opts.customRelay, response.data);
      });
    }
  }

  onPrePlay(id, streamPath, args) {
    if (!this.config.relay.tasks) {
      return;
    }
    let regRes = /\/(.*)\/(.*)/gi.exec(streamPath);
    let [app, stream] = _.slice(regRes, 1);
    let i = this.config.relay.tasks.length;
    while (i--) {
      let conf = this.config.relay.tasks[i];
      let isPull = conf.mode === 'pull';
      if (isPull && app === conf.app && !context.publishers.has(streamPath)) {
        let hasApp = conf.edge.match(/rtmp:\/\/([^\/]+)\/([^\/]+)/);
        conf.ffmpeg = this.config.relay.ffmpeg;
        conf.inPath = hasApp ? `${conf.edge}/${stream}` : `${conf.edge}${streamPath}`;
        conf.ouPath = `rtmp://127.0.0.1:${this.config.rtmp.port}${streamPath}`;
        let session = new NodeRelaySession(conf);
        session.id = id;
        session.on('end', (id) => {
          this.dynamicSessions.delete(id);
        });
        this.dynamicSessions.set(id, session);
        session.run();
        Logger.log('[Relay dynamic pull] start', id, conf.inPath, ' to ', conf.ouPath);
      }
    }
  }

  onDonePlay(id, streamPath, args) {
    let session = this.dynamicSessions.get(id);
    let publisher = context.sessions.get(context.publishers.get(streamPath));
    if (session && publisher.players.size == 0) {
      session.end();
    }
  }

  onPostPublish(id, streamPath, args) {
    if (!this.config.relay.tasks) {
      return;
    }
    let regRes = /\/(.*)\/(.*)/gi.exec(streamPath);
    let [app, stream] = _.slice(regRes, 1);
    let i = this.config.relay.tasks.length;
    while (i--) {
      let conf = this.config.relay.tasks[i];
      let isPush = conf.mode === 'push';
      if (isPush && app === conf.app) {
        let hasApp = conf.edge.match(/rtmp:\/\/([^\/]+)\/([^\/]+)/);
        conf.ffmpeg = this.config.relay.ffmpeg;
        conf.inPath = `rtmp://127.0.0.1:${this.config.rtmp.port}${streamPath}`;
        conf.ouPath = conf.appendName === false ? conf.edge : (hasApp ? `${conf.edge}/${stream}` : `${conf.edge}${streamPath}`);
        let session = new NodeRelaySession(conf);
        session.id = id;
        session.on('end', (id) => {
          this.dynamicSessions.delete(id);
        });
        this.dynamicSessions.set(id, session);
        session.run();
        Logger.log('[Relay dynamic push] start', id, conf.inPath, ' to ', conf.ouPath);
      }
    }

  }

  onDonePublish(id, streamPath, args) {
    let session = this.dynamicSessions.get(id);
    if (session) {
      session.end();
    }

    for (session of this.staticSessions.values()) {
      if (session.streamPath === streamPath) {
        session.end();
      }
    }
  }

  stop() {
    clearInterval(this.staticCycle);
  }
}

module.exports = NodeRelayServer;
