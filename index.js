var mongo = require('mongodb').MongoClient;
var express = require('express');
var app = require('express')();
var server = require('http').createServer(app);
var port = process.env.PORT || 8080;

// Consts
const mongodbAddress = 'mongodb://tpan496:trollNoob971006!@exp-server-shard-00-00-8ecae.mongodb.net:27017,exp-server-shard-00-01-8ecae.mongodb.net:27017,exp-server-shard-00-02-8ecae.mongodb.net:27017/exp-server?ssl=true&replicaSet=exp-server-shard-0&authSource=admin'
const forceSyncThreshold = 3; // synchronize check frequency
const whitespacePattern = /^\s*$/;
const YT_VIDEO_ENDED = 0;
const YT_VIDEO_PLAYING = 1;
const YT_VIDEO_PAUSED = 2;

// Only one room, so keeping the host here
var clientIdList = [];
var videoRequestList = [];
var currentVideoUrl = 'VtI5HM7GVGY'; // default video
var hostYTPlayerStatus;
var videoHostId;
var videoHostTime;

// Server settings
var socket = require('socket.io')({
    transports: ['websocket']
});
server.listen(port);
app.use(express.static(__dirname));

// Establish socket listener
var client = socket.listen(server);

// Connect to mongodb and respond to client events
mongo.connect(mongodbAddress, function (error, db) {
    if (error) throw error;
    client.on('connection', function (socket) {
        console.log('New client: ' + socket.id);
        clientIdList.push(socket.id);

        // Get chat history and video playlist from database
        var chatMessages = db.collection('chat_messages'),
            playlistUrls = db.collection('playlist_urls'),
            sendStatus = function (s) {
                socket.emit('status', s);
            };

        // Display history messages to client
        chatMessages.find().limit(100).sort({ _id: 1 }).toArray(function (error, result) {
            if (error) throw error;
            console.log(result);
            socket.emit('new_chat_message', result);
        });

        // Display playlist to client
        for (var i = 0; i < videoRequestList.length; i++) {
            var payload = videoRequestList[i];
            socket.emit('new_video_url', [payload]);
        }

        // Listen for new chat message
        socket.on('user_chat_message', function (payload) {
            var name = payload.name,
                message = payload.message;

            if (whitespacePattern.test(name) || whitespacePattern.test(message)) {
                sendStatus('Name and message is required');
            } else {
                chatMessages.insert({ name: name, message: message }, function () {
                    // Emit latest messages
                    client.emit('new_chat_message', [payload]);
                    sendStatus({ message: 'Message sent', clear: true });
                })
            }
        });

        // Listen for new video url
        socket.on('user_video_url', function (payload) {
            var name = payload.name,
                url = payload.url;

            if (whitespacePattern.test(name) || whitespacePattern.test(url)) {
                sendStatus('Valid url is required');
            } else {

                // Throw url into playlist
                client.emit('new_video_url', [payload]);
                videoRequestList.push({ name: name, url: url });

                // If no video is playing now
                if (hostYTPlayerStatus == YT_VIDEO_ENDED) {
                    videoRequestList.shift();
                    currentVideoUrl = url;
                    client.emit('new_video_id', { name: name, id: currentVideoUrl });
                }
                console.log(url);
                sendStatus({ message: 'Url sent', clear: true });
            }
        });

        // Listen for youtube player status
        socket.on('user_youtube_player_status', function (payload) {
            if (payload.status == 1) {
                if (videoHostId == null) {
                    console.log('Host appeared: ' + socket.id);
                    videoHostId = socket.id;
                    socket.emit("host_video_progress", { time: videoHostTime, status: hostYTPlayerStatus, hostId: videoHostId });
                }
                socket.emit('new_video_id', { id: currentVideoUrl });
            }
        });

        // Listen for video progress and force sync if necessary
        socket.on('user_video_progress', function (payload) {
            var time = payload.time;
            var status = payload.status;
            if (socket.id === videoHostId) {
                videoHostTime = time;
                switch (status) {
                    case YT_VIDEO_ENDED:
                        if (videoRequestList.length > 0) {
                            var request = videoRequestList.shift();
                            currentVideoUrl = request.url;
                            client.emit('new_video_id', { name: request.name, id: currentVideoUrl });
                        }
                        break;
                    case YT_VIDEO_PLAYING:
                        if (hostYTPlayerStatus !== status) {
                            client.emit("host_video_progress", { time: videoHostTime, status: YT_VIDEO_PLAYING, hostId: videoHostId });
                        }
                        break;
                    case YT_VIDEO_PAUSED: client.emit("host_video_progress", { time: videoHostTime, status: YT_VIDEO_PAUSED, hostId: videoHostId }); break;
                    default: break;
                }
                hostYTPlayerStatus = status;
                console.log('Host progress: ' + time);
            } else {
                if (status !== hostYTPlayerStatus) {
                    socket.emit("host_video_progress", { time: videoHostTime, status: hostYTPlayerStatus, hostId: videoHostId });
                }
                else if (Math.abs(videoHostTime - time) > forceSyncThreshold) {
                    socket.emit("host_video_progress", { time: videoHostTime, status: status, hostId: videoHostId });
                }
            }
        });

        // Request to be host
        socket.on('user_host_request', function (payload) {
            videoHostId = socket.id;
            socket.emit("host_video_progress", { time: payload.time, status: payload.status, hostId: videoHostId });
        });

        // Request to skip
        socket.on('user_skip_request', function (payload) {
            console.log(socket.id + ' ' + videoHostId);
            if (socket.id === videoHostId) {
                if (videoRequestList.length > 0) {
                    var request = videoRequestList.shift();
                    currentVideoUrl = request.url;
                    client.emit('new_video_id', { name: request.name, id: currentVideoUrl });
                }
            }
        });
    });
});

console.log("Server running at http://localhost:%d", port);
