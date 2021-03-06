// Video Player
var YTPlayer;
var YTPlayerIsReady = false;
var YTPlayerStatus;
var localPlayerStatus;
var prevCommand;
var curCommand;
var editing;

var tag = document.createElement('script');

tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var getNode = function (s) {
    return document.querySelector(s);
},
    body = getNode('.main');
    status = getNode('.chat-status span'),
    messages = getNode('.chat-messages'),
    textarea = getNode('#chat-textarea'),
    chatName = getNode('#chat-name'),
    statusDefault = status.textContent,
    playlist = getNode('.video-playlist'),
    userlist = getNode('.video-users'),
    videoTitle = getNode('.video-banner'),
    hostId = getNode('.host-id');

// Establish socket
try {
    var socket = io.connect();
} catch (e) {
    throw e;
}

// Status for texting/video
var setStatus = function (s) {
    status.textContent = s;
    if (s !== statusDefault) {
        var delay = setTimeout(function () {
            setStatus(statusDefault);
            clearInterval(delay);
        }, 5000);
    }
};

// Request to be host
document.getElementById("host-button").onclick = function () {
    if (YTPlayerIsReady) {
        socket.emit('user_host_request', { time: YTPlayer.getCurrentTime, status: YTPlayerStatus });
    } else {
        setStatus('Your player is not ready');
    }
};

// Configure chat and console button
var isUsingConsole = false;
var chatButton = document.getElementById("chat-button-use-chat");
var consoleButton = document.getElementById("chat-button-use-console");
chatButton.style.background = '#009DDC';
consoleButton.style.background = '#EEE';
chatButton.onclick = function () {
    isUsingConsole = false;
    textarea.setAttribute('placeholder', 'Enter chat message');
    chatButton.style.background = '#009DDC';
    consoleButton.style.background = '#EEE';
};
consoleButton.onclick = function () {
    isUsingConsole = true;
    textarea.setAttribute('placeholder', 'Enter console command');
    chatButton.style.background = '#EEE';
    consoleButton.style.background = '#009DDC';
};

// Status Indicator
var videoStatus = document.getElementById('video-button-video-status');

// Skip button
skipButton = document.getElementById('video-button-skip').onclick = function () {
    socket.emit('user_skip_request', 1);
};

// Emit socket after api is ready
function onYouTubeIframeAPIReady() {
    if (socket != null) {
        socket.emit('user_youtube_player_status', { status: 1 });
        console.log('Youtube player loaded');
    }
};

// Repeatedly send local video progress
function sendVideoProgress() {
    if (YTPlayerIsReady) {
        if (socket !== undefined && YTPlayerStatus !== YT.PlayerState.PAUSED) {
            socket.emit('user_youtube_video_progress', { time: YTPlayer.getCurrentTime(), status: localPlayerStatus });
        }
        var delay = setTimeout(function () {
            sendVideoProgress();
            clearInterval(delay);
        }, 1000);
    }
};

function onPlayerReady(event) {
    event.target.playVideo();
    YTPlayerStatus = 1;
    YTPlayerIsReady = true;
    videoTitle.textContent = YTPlayer.getVideoData().title.substring(0, 40);
    sendVideoProgress();
}

function onPlayerStateChange(event) {
    localPlayerStatus = event.data;
    if (event.data != YTPlayerStatus && event.data !== YT.PlayerState.BUFFERING) {
        socket.emit('user_youtube_video_progress', { time: YTPlayer.getCurrentTime(), status: event.data });
    }
}

function stopVideo() {
    YTPlayer.stopVideo();
}

// Main body
(function () {

    setStatus('Testing...');

    // Socket events
    if (socket != undefined) {

        // Listen for new user
        socket.on('new_user', function (payload) {
            while (userlist.firstChild) {
                userlist.removeChild(userlist.firstChild);
            }
            if (payload.length) {
                // Loop through messages
                for (var x = 0; x < payload.length; x = x + 1) {
                    var user = document.createElement('div');
                    user.setAttribute('class', 'user');
                    user.textContent = payload[x].id;
                    if (payload[x].id != socket.id) {
                        spawnNewPlayer(payload[x].id, payload[x].x, payload[x].y, payload[x].z, payload[x].color)
                    }
                    user.style.background = payload[x].color;

                    // Append
                    userlist.appendChild(user);
                    userlist.insertBefore(user, userlist.firstChild);
                }
            }
        });

        // Listen for user list update
        socket.on('user_list_update', function (payload) {
            // Remove everything from userlist
            while (userlist.firstChild) {
                userlist.removeChild(userlist.firstChild);
            }

            if (payload.length) {
                // Loop through messages
                for (var x = 0; x < payload.length; x = x + 1) {
                    var user = document.createElement('div');
                    user.setAttribute('class', 'user');
                    user.textContent = payload[x].id;

                    // Append
                    userlist.appendChild(user);
                    userlist.insertBefore(user, userlist.firstChild);
                }
            }
        });

        // Listen for new chat message
        socket.on('new_chat_message', function (payload) {
            if (payload.length) {
                // Loop through messages
                for (var x = 0; x < payload.length; x = x + 1) {
                    var message = document.createElement('div');
                    message.setAttribute('class', 'chat-message');
                    message.textContent = payload[x].name + ': ' + payload[x].message;

                    // Append
                    messages.appendChild(message);
                    messages.insertBefore(message, messages.firstChild);
                }
            }
        });

        // Listen for new video url
        socket.on('new_video_url', function (payload) {
            if (payload.length) {
                // Loop through messages
                for (var x = 0; x < payload.length; x = x + 1) {
                    var url = document.createElement('div');
                    url.setAttribute('class', 'video-url');
                    url.setAttribute('margin', '5px');
                    url.textContent = payload[x].name + ' wants to play: ' + payload[x].command;

                    // Append
                    playlist.appendChild(url);
                    playlist.insertBefore(url, playlist.firstChild);
                }
            }
        });

        // Listen for a status
        socket.on('status', function (payload) {
            setStatus((typeof payload === 'object') ? payload.message : payload);
            if (payload.clear) {
                textarea.value = '';
            }
        });

        // Listen for chat/console input
        textarea.addEventListener('keydown', function (event) {
            var self = this,
                name = chatName.value;
            if (event.which === 13 && event.shiftKey === false) {
                if (isUsingConsole) {
                    prevCommand = self.value;
                    curCommand = '';
                    socket.emit('user_console_command', {
                        name: name,
                        command: self.value
                    });
                } else {
                    socket.emit('user_chat_message', {
                        name: name,
                        message: self.value
                    });
                }
            } else if (event.which == 38 && isUsingConsole) {
                curCommand = textarea.value;
                textarea.value = prevCommand;
            } else if (event.which == 40 && isUsingConsole) {
                textarea.value = curCommand;
            }
        });

        // Listen for generating video
        var self = this;
        socket.on('new_video_id', function (payload) {
            console.log('new player');
            if (YTPlayer !== undefined) {
                YTPlayer.destroy();
                YTPlayerIsReady = false;
            }
            self.YTPlayer = new YT.Player('video-placeholder', {
                height: '360',
                width: '480',
                videoId: payload.id,
                playerVars: { 'autoplay': 1, 'controls': 1 },
                events: {
                    'onReady': self.onPlayerReady,
                    'onStateChange': self.onPlayerStateChange
                }
            });

            if (playlist.firstChild) {
                playlist.removeChild(playlist.firstChild);
            }
        });

        // Listen for force sync
        socket.on('host_youtube_video_progress', function (payload) {
            console.log('Force sync recieved at ' + payload.time + ' status: ' + payload.status);
            hostId.textContent = 'current host: ' + payload.hostId;
            if (!YTPlayerIsReady) {
                return;
            }
            switch (payload.status) {
                case YT.PlayerState.PLAYING:
                    if (YTPlayerStatus !== 1) {
                        YTPlayer.playVideo();
                        YTPlayerStatus = 1;
                    }
                    break;
                case YT.PlayerState.PAUSED:
                    YTPlayer.pauseVideo();
                    YTPlayerStatus = 2;
                    console.log('paused');
                    break;
                default: break;
            }
            switch (YTPlayerStatus) {
                case YT.PlayerState.PLAYING:
                    videoStatus.innerHTML = "PLAYING";
                    videoStatus.style.background = "#0f0";
                    break;
                case YT.PlayerState.PAUSED:
                    videoStatus.innerHTML = "PAUSED";
                    videoStatus.style.background = "#f00";
                    break;
                case YT.PlayerState.ENDED:
                    videoStatus.innerHTML = "ENDED";
                    videoStatus.style.background = "#fff";
                    break;
                case YT.PlayerState.BUFFERING:
                    videoStatus.innerHTML = "BUFFERING";
                    videoStatus.style.background = "#00f";
                    break;
                default: break;
            }
            if (YTPlayerIsReady) {
                YTPlayer.seekTo(payload.time, true);
            }
        });

        // Popcorn
        socket.on('popcorn', function (payload) {
            var sprite = document.createElement('img');
            sprite.setAttribute('src', 'image/popcorn.png');
            sprite.style.position = "absolute";
            sprite.style.top = window.innerHeight * Math.random();
            sprite.style.left = window.innerWidth * Math.random();
            sprite.width = 60;
            sprite.height = 100;
            body.appendChild(sprite);
            var op = 10;  // initial opacity
            var delay = setTimeout(function () {
                var timer = setInterval(function () {
                    if (op <= 0) {
                        body.removeChild(sprite);
                        clearInterval(timer);
                    }
                    sprite.style.opacity = op;
                    sprite.style.filter = 'alpha(opacity=' + op * 100 + ")";
                    op -= 0.05;
                }, 10);
                clearInterval(delay);
            }, 2000);
        });

        // Huaji
        socket.on('huaji', function (payload) {
            var sprite = document.createElement('img');
            sprite.setAttribute('src', 'image/huaji.png');
            sprite.style.position = "absolute";
            sprite.style.top = window.innerHeight * Math.random();
            sprite.style.left = window.innerWidth * Math.random();
            sprite.width = 100;
            sprite.height = 100;
            body.appendChild(sprite);
            var op = 10;  // initial opacity
            var delay = setTimeout(function () {
                var timer = setInterval(function () {
                    if (op <= 0) {
                        body.removeChild(sprite);
                        clearInterval(timer);
                    }
                    sprite.style.opacity = op;
                    sprite.style.filter = 'alpha(opacity=' + op * 100 + ")";
                    op -= 0.05;
                }, 10);
                clearInterval(delay);
            }, 2000);
        });

        // Pogchamp
        socket.on('pogchamp', function (payload) {
            var sprite = document.createElement('img');
            sprite.setAttribute('src', 'image/pogchamp.png');
            sprite.style.position = "absolute";
            sprite.style.top = window.innerHeight * Math.random();
            sprite.style.left = window.innerWidth * Math.random();
            sprite.width = 120;
            sprite.height = 100;
            body.appendChild(sprite);
            var op = 1;  // initial opacity
            var delay = setTimeout(function () {
                var timer = setInterval(function () {
                    if (op <= 0) {
                        body.removeChild(sprite);
                        clearInterval(timer);
                    }
                    sprite.style.opacity = op;
                    sprite.style.filter = 'alpha(opacity=' + op * 100 + ")";
                    op -= 0.05;
                }, 10);
                clearInterval(delay);
            }, 2000);
        });

        // Other player moved
        socket.on('user_3d_moved', function (payload) {
            if (payload.id != socket.id) {
                movePlayer(payload.id, payload.x, payload.y, payload.z);
            }
        });

        // Delete player
        socket.on('user_3d_left', function (payload) {
            if (payload.id != socket.id) {
                deletePlayer(payload.id);
            }
        });

        // Throw ball
        socket.on('user_3d_throw_ball', function (payload) {
            if (payload.id != socket.id) {
                throwBall(payload.position, payload.shootDirection);
            }
        });
    }
})();