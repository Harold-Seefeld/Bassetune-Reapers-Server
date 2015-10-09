var cluster = require('cluster');
var exitHandler = require('./modules/appExitHandler').cleanup();
if(cluster.isMaster) {
  //master should communicate with face instances using http on startPort
  var startPort = process.env.PORT || 3000;//startPort is reserved for http server to communicate with backendFace
  var redisClient = require('./modules/redisHandler').redisClient;
  var uuid = require('node-uuid');

  // Count the machine's CPUs
  var cpuCount = require('os').cpus().length;
  var workers = [];

  // Create worker children
  for (var i = 1; i < cpuCount + 1; i++) {
    var workerPort = startPort + i;
    var workerID = uuid.v1();
    var w = cluster.fork({port: workerPort, workerID: workerID});
    var workerHandler = {worker: w, port: workerPort, workerID: workerID};
    workers[w.id] = workerHandler;
  }

  // Listen for dying workers
  cluster.on('exit', function (worker) {
    // Replace the dead worker, we're not sentimental
    console.log('Worker ' + worker.id + ' died.');
    redisClient.lrem("gameServerInstances", workers[worker.id].workerID);
    redisClient.del(workers[worker.id].workerID);
    // Create new worker
    var workerID = uuid.v1(); // Assign a new id
    var w = cluster.fork({port: workers[worker.id].port, workerID: workerID});
    workers[w.id] = {worker: w, port: workerPort, workerID: workerID};
  });

  console.log("Master finished processing initial statements.");
}

if (cluster.isWorker)
{
 

  var ip = require('external-ip')()(function(err, ip) {
    // Check if failed
    if (err || !ip) {
      console.log("Worker ID: " + process.env.workerID + " - couldn't retrieve IP.");
      process.exit();
    }
    // Otherwise continue
    var Event = require('./classes/EventEnum');
    var redisClient = require('./modules/redisHandler').redisClient;
    var app = require('express')();
    var bodyparser = require('body-parser');
    
    app.use(bodyparser.json()); // for parsing application/json
    app.use(bodyparser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
    var http = require("http").Server(app);
    var Room = require("./classes/Room");
    var rooms = {};

    app.set('port', process.env.port || 3000);
    // Listen for create room calls
    app.post('/createRoom', function (req, res) 
    {
      console.log("post request");
      // Check authentication
      if (req.body.auth != "45X%Dg@}R`d-E])x9d") 
      {
        return;
      }
      // Parse data
      console.log(req.body.id);

      var match = req.body.match;
      console.log(match);
      var matchID = req.body.id;//parseInt(req.body.matchID, 10);
      var config = {
        matchType: match.matchType,
        matchPlayers: match.matchPlayers,
        bosses: match.bosses,
        knights: match.knights,
        players: match.bosses.concat(match.knights)//what do we need this for?
      };
      // Create room using data
      var room = new Room(io, matchID, config);
      rooms[matchID] = room;
      // Update redis
      redisClient.hincrby(process.env.workerID, "numberGames", 1);
      //Reply
      console.log("sending ok.");
      console.log(matchID);
      res.send(matchID);
    });

    
    console.log('Worker ID: ' + process.env.workerID + ' listening at ' + ip + ' on port ' + app.get("port"));

    // Get region
    var request = require('request');
    request('http://169.254.169.254/latest/meta-data/placement/availability-zone', function (error, response, body) {
      if (!error && response.statusCode == 200) {
        // Update redis
        var regions = ["us-east-1", "us-west-1", "us-west-2", "sa-east-1", "eu-west-1", "eu-central-1", "ap-southeast-2",
                      "ap-southeast-1", "ap-northeast-1"];
        var region = regions[0];
        regions.forEach(function(regionName) {
          if (body.toLowerCase().indexOf(regionName) != -1) {
            region = regionName;
          }
        });
        redisClient.lpush("gameServerInstances", process.env.workerID);
        redisClient.hmset(process.env.workerID,
          {
            ip: ip,
            port: process.env.port,
            numberGames: 0,
            region: region
          });
        console.log("Worker ID: " + process.env.workerID + " - Updated Redis.");
      } else {
        console.log("Worker ID: " + process.env.workerID + " - couldn't get region.");
        //process.exit(0);
        //THIS STUFF IS TO BE DELETED
        redisClient.lpush("gameServerInstances", process.env.workerID);
        redisClient.hmset(process.env.workerID,
          {
            ip: ip,
            port: process.env.port,
            numberGames: 0,
            region: "us-east-1"
          });
      }
    });

    // Start SocketIO
    var io = require('socket.io')({transports: ['websocket']});

    if (io) {
      console.log("Worker ID: " + process.env.workerID + " - Socket.IO running and accepting connections.");
    }

    io.on('connection', function (socket) 
    {
      var socketID = socket.id;
      var clientIP = socket.request.connection.remoteAddress;
      console.log("WorkerID: " + process.env.workerID + ': ' + clientIP + " just connected.");
      socket.emit('ok');

      socket.on('joinRoom', function (data) {
        console.log("in join room");
        console.log(data);
        socket.join(data.game_uuid);
        socket.emit('joinedRoom');
        console.log("socket rooms")
        console.log(socket.rooms);
        //starting now, rest of communication is with Room
      });

      socket.on('getRoom', function () 
      {
        socket.emit("room", socket.rooms);
      })


      //Note:
      //to get the room (gameID) of the socket : socket.rooms[1]



      socket.on('register', function  (data) 
      {
        rooms[socket.rooms[1]].onRegister(socket,data);
      });

      socket.on('disconnect', function () 
      {
        rooms[socket.rooms[1]].onDisconnect(socket);
      });

      socket.on(Event.input.TALK, function (data) 
      {
        rooms[socket.rooms[1]].onTalk(socket,data);
      });

      socket.on(Event.input.MOVE, function (data) 
      {
        rooms[socket.rooms[1]].onMove(socket,data);
      });

      socket.on(Event.input.LEAVE, function () 
      {
        rooms[socket.rooms[1]].onLeave(socket);
      });
      
      socket.on(Event.input.knight.CHANGE_EQUIPPED, function (data) 
      {
        rooms[socket.rooms[1]].onKnightChangeEquipped(socket,data);
      });

      socket.on(Event.input.knight.ABILITY_START, function (data) 
      {
        rooms[socket.rooms[1]].onKnightAbilityStart(socket,data);
      });

      socket.on(Event.input.knight.USE_ITEM_START, function (data) 
      {
        rooms[socket.rooms[1]].onKnightUseItemStart(socket,data);
      });

      socket.on(Event.input.boss.PUT_TRAP, function (data) 
      {
        rooms[socket.rooms[1]].onBossPutTrap(socket,data);
      });

      socket.on(Event.input.boss.ABILITY_START, function (data) 
      {
        rooms[socket.rooms[1]].onBossAbilityStart(socket,data);
      });
    });//end io.on Connection
    var server = app.listen(app.get("port"),function () 
    {
        io.listen(server);
    });
  });
}