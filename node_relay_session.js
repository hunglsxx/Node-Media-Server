//
//  Created by Mingliang Chen on 18/3/16.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');
const NodeCoreUtils = require("./node_core_utils");

const EventEmitter = require('events');
const { spawn } = require('child_process');

const RTSP_TRANSPORT = ['udp', 'tcp', 'udp_multicast', 'http'];

var axios = require('axios');

class NodeRelaySession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
    this.id = NodeCoreUtils.generateNewSessionID();
    this.TAG = 'relay';
  }

  run() {
    let format = this.conf.ouPath.startsWith('rtsp://') ? 'rtsp' : 'flv';
    let argv = ['-i', this.conf.inPath, '-c', 'copy', '-f', format, this.conf.ouPath];
    console.log('in:',this.conf.inPath);
    if (this.conf.inPath[0] === '/' || this.conf.inPath[1] === ':') {
      argv.unshift('-1');
      argv.unshift('-stream_loop');
      argv.unshift('-re');
    }
    console.log('argv', argv);

    if (this.conf.inPath.startsWith('rtsp://') && this.conf.rtsp_transport) {
      if (RTSP_TRANSPORT.indexOf(this.conf.rtsp_transport) > -1) {
        argv.unshift(this.conf.rtsp_transport);
        argv.unshift('-rtsp_transport');
      }
    }

    Logger.ffdebug(argv.toString());
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Relay end] id=', this.id);
      this.emit('end', this.id);
    });
  }

  runCustom(isLoop) {
    var argv = ['-i', this.conf.inPath];
    if(isLoop) {
      argv.unshift('-1');
      argv.unshift('-stream_loop');
      argv.unshift('-re');
    }
    for(var i in this.conf.ouPath) {
      let format = this.conf.ouPath[i].startsWith('rtsp://') ? 'rtsp' : 'flv';
      argv = argv.concat(['-c', 'copy', '-f', format, this.conf.ouPath[i]]);
    }

    if (this.conf.inPath.startsWith('rtsp://') && this.conf.rtsp_transport) {
      if (RTSP_TRANSPORT.indexOf(this.conf.rtsp_transport) > -1) {
        argv.unshift(this.conf.rtsp_transport);
        argv.unshift('-rtsp_transport');
      }
    }

    Logger.ffdebug(argv.toString());
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);

    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      var self = this;
      Logger.log('[Relay end] id=', this.id);
      this.emit('end', this.id);

      if(self.conf.opts.callback 
          && self.conf.opts.callback.api 
          && self.conf.opts.callback.update_relay_status_endpoint) {
        var url = `${self.conf.opts.callback.api}/${self.conf.opts.callback.update_relay_status_endpoint}/${self.conf.opts.customRelay}/1`;
        axios({
          method: 'PATCH',
          url: url,
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          data : {}
        }).then(function (response) {
          Logger.log('[Updated session id]:', self.id, self.conf.opts.customRelay, response.data);
        });
      }
    });
  }

  end() {
    this.ffmpeg_exec.kill();
  }
}

module.exports = NodeRelaySession;
