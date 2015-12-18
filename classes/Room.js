var Chat = require('./Chat');
var Location = require('./Location');
var Map = require('./Map');
var Event = require('./EventEnum');
var Finder = require('./Finder');
var MySQLHandler = require('./mysqlHandler');

var Room = function (io, matchID, config) {
  // Bind parameters to room
  this.matchID = matchID;
  this.io = io;
  this.config =   config;

  // Start instances of modules
  this.map = new Map();
  this.chat = new Chat(io, matchID);
  this.location = new Location(io, matchID, this.map);
  this.characterManager = require('./CharacterManager');
  
  // All players that exist in the current game
  this.players = [];
  // All characters
  this.characters = [];
  this.location.characters = this.characters;

  /*
    Get player Data
   */
  var StorePlayerData = function (config, characterManager, location, characters) {
    // Get player data
    var players = [];
    var itemList = require("./resources/items");
    config.bosses.concat(config.knights).forEach(function (accountID) {
      MySQLHandler.connection.query("SELECT * FROM br_account WHERE account_id = ?" , [accountID] , function(err,results) {
        if (err) {
          return;
        }
        players.push(results[0]);
      });
    });
    this.players = players;
    // Sort boss data
    config.bosses.forEach(function(accountID) {
      MySQLHandler.connection.query("SELECT boss_slots FROM br_inventory WHERE account_id = ?", [accountID], function(err, results) {
        if (err || results.length < 1) {
          return;
        }
        var bossSlots = JSON.parse(results[0].boss_slots);
        for (var key in bossSlots) {
          var slot = bossSlots[key];
          var item = {};
          // Find the item using the ID
          itemList.forEach(function(itemInfo) {
            if (itemInfo.id == slot[0]) {
              item = itemInfo;
            }
          });
          // TODO: Filter bosses, minibosses, creatures, traps
          // Only create the boss for now
          if (item.purpose == "boss") {
            var boss = characterManager.SpawnBoss(accountID, Finder.GetPlayerFromAccountID(players, accountID).boss_level, item.value);
            characters.push(boss);
            // TODO: Calculate proper starting positions
            //for now they all start in the same spot
            location.AddCharacter(character.id, {x: 20, y : 20});
          }
        }
      });
    });
    config.knights.forEach(function(accountID) {
      // Get all equipped items and abilities
      MySQLHandler.connection.query("SELECT knight_slots, ability_slots FROM br_inventory WHERE account_id = ?", [accountID], function(err, results) {
        var items = [];
        var abilities = [];
        var weapons = [];
        var knightSlots = JSON.parse(results[0].knight_slots);
        for (var key in knightSlots) {
          var slot = knightSlots[key];
          // Find the item using the ID
          var item = {};
          itemList.forEach(function (itemInfo) {
            if (itemInfo.id == slot[0]) {
              item = itemInfo;
            }
          });
          for (var i = 0; i < results.length; i++) {
            if (item.purpose == "weapon") {
              weapons.push(results[i]);
            } else if (item.purpose == "item") {
              items.push(results[i]);
            }
          }
        }
        var abilitySlots = JSON.parse(results[0].ability_slots);
        for (var key in abilitySlots) {
          var slot = abilitySlots[key];
          // Find the item using the ID
          var item = {};
          itemList.forEach(function (itemInfo) {
            if (itemInfo.id == slot[0]) {
              item = itemInfo;
            }
          });
          for (var i = 0; i < results.length; i++) {
            console.log("weapon id: " + results[i].weapon_id);
            if (item.purpose == "ability") {
              abilities.push(results[i]);
            }
          }
        }
        var character = characterManager.SpawnKnight(accountID);
        character.knight.inventory.items = items;
        character.knight.abilities = abilities;
        character.knight.inventory.weapons = weapons;
        character.knight.inventory.sortInventory();
        characters.push(character);
        // Set character location
        // TODO: Calculate proper starting positions
        location.AddCharacter(character.id, {x: 30, y: 30});
      });
    });
  };
  StorePlayerData(config, this.characterManager, this.location, this.characters);

  /*
 Send Updates
 */
  var SendUpdates  = function (characters, location)
  {
    // Locations
    characters.forEach(function(character) {
      location.UpdateCharacterPositions(character.id, character.speed);
    });
    location.SendCharacterLocations();
    location.UpdateTime();
    // HP
    var hp = [];
    characters.forEach(function(character) {
      if (character.hp != character.prevhp) {
        hp.push({i:character.id, h:character.hp});
        character.prevhp = character.hp;
      }
    });
    io.to(matchID).emit(Event.output.CHAR_HP, hp);
  };
  // Start Game Loop, 12 Updates per second
  setInterval(SendUpdates, 83, this.characters, this.location);
};

/*
 Handle Reconnection
 */
//io.sockets.in(game_uuid).on('register', function (data)
Room.prototype.onRegister = function (socket, data)
{
  if (!this.players.some(function (player) {
    if (data.uuid == player.last_uuid) {
      player.socketID = socket.id;
      return true;
    }
      return false;
  })) {
    socket.disconnect();
  }
  console.log("registr");
  // Emit the characters
  this.characters.forEach(function(character) {
    socket.emit(Event.output.CHAR_CREATED, {ID: character.id, Owner: character.owner, Entity: character.entity, HP: character.hp});
  });
  // Emit the locations of each character

  // Emit the players
};

/*
 Listeners: Input from the player
 */

// Disconnection
//io.sockets.in(game_uuid).on('disconnect',
Room.prototype.onDisconnect = function (socket)
{
  var username = Finder.GetUsernameFromSocketID(this.players, socket.id);
  require('./Disconnect')(socket, username, game_uuid, io);
};
// Text Chat
//io.sockets.in(game_uuid).on(Event.input.TALK,
Room.prototype.onTalk = function (socket , data)
{
  this.players.forEach(function (player) {
    if (player.socketID == socket.id) {
      this.chat.addMsg(player.username, data.message);
    }
  });
};
// Movement
//io.sockets.in(game_uuid).on(Event.input.MOVE,
Room.prototype.onMove = function (socket , data)
{
  // Received data in form of {characterID:[locationX, locationY}, ...}
  for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    // Check if data is valid or not
    if (isNaN(parseFloat(data[key][0])) || isNaN(parseFloat(data[key][1]))) {
      return;
    }
    characters.some(function (character) {
      if (character.id != key) {
        return false;
      }
      // Check if channelling
      if (character.channelling) {
        if (character.channelling != false) {
          if (character.channelling == true) {
            character.channelling = "m";
          } else {
            character.channelling += "m";
          }
          character.channellingAbility.CheckInterruption();
        }
      }
      this.players.forEach(function (player) {
        if (player.socketID == socket.id && Finder.GetAccountIDFromSocketID(this.players, socketID) == character.owner) {
          location.UpdateDestination(key, data[key]);
          return true;
        }
      });
    });
  }
};
// Leave
//io.sockets.in(game_uuid).on(Event.input.LEAVE,
Room.prototype.onLeave = function (socket)
{
  var username = Finder.GetUsernameFromSocketID(players, socket.id);
  require('./Disconnect')(socket, username, game_uuid, io);
};
// Knight changing equipped armor
//io.sockets.in(game_uuid).on(Event.input.knight.CHANGE_EQUIPPED,
Room.prototype.onKnightChangeEquipped = function (socket,data)
{
  var characterID = parseInt(data.characterID, 10);
  if (!isNaN(characterID) && characterID < characters.length &&
    Finder.GetAccountIDFromSocketID(this.players, socket.id) == characters[characterID].owner && characters[characterID].knight != null) {
    characters[characterID].knight.ChangeEquipped(data.itemID, data.target);
  }
};
// Knight using ability
//io.sockets.in(game_uuid).on(Event.input.knight.ABILITY_START,
Room.prototype.onKnightAbilityStart = function (socket,data)
{
  var abilityID = parseInt(data.abilityID, 10);
  var characterID = parseInt(data.characterID, 10);
  var weaponID = parseInt(data.weapon, 10);
  if (isNaN(abilityID) || isNaN(characterID) || isNaN(weaponID) || data.target == null ||
    !data.target.hasOwnProperty("x") || !data.target.hasOwnProperty("y")) {
    return;
  }
  characters.forEach(function (character) {
    if (character.id != characterID && character.type == "knight") {
      return;
    }
    this.players.forEach(function (player) {
      if (player.socketID == socket.id && Finder.GetAccountIDFromSocketID(this.players, socket.id) == character.owner) {
        if (!character.stunned && character.knight != null) {
          data.abilityID = abilityID;
          data.weaponID = weaponID;
          data.location = location;
          data.character = character;
          data.characters = characterID;
          data.game_uuid = game_uuid;
          data.io = this.io;
          character.knight.UseAbility(data);
        }
      }
    });
  });
};
// Knight using item
//io.sockets.in(game_uuid).on(Event.input.knight.USE_ITEM_START,
Room.prototype.onKnightUseItemStart = function (socket,data)
{
  var characterID = parseInt(data.characterID, 10);
  var itemID = parseInt(data.itemID, 10);
  if (isNaN(characterID) || isNaN(itemID)) {
    return;
  }
  this.characters.forEach(function (character) {
    if (character.id != characterID) {
      return;
    }
    this.players.forEach(function (player) {
      if (player.socketID == socket.id && Finder.GetAccountIDFromSocketID(this.players, socket.id) == character.owner) {
        if (!character.stunned && character.knight != null) {
          data.itemID = itemID;
          data.location = location;
          data.character = characters[characterID];
          data.characters = characters;
          data.game_uuid = game_uuid;
          data.io = this.io;
          character.knight.UseItem(data);
        }
      }
    });
  });
};
// Boss putting a trap down
//io.sockets.in(game_uuid).on(Event.input.boss.PUT_TRAP,
Room.prototype.onBossPutTrap = function (socket,data)
{
  // TODO: Put a trap
};
// Boss using an ability
//io.sockets.in(game_uuid).on(Event.input.boss.ABILITY_START,
Room.prototype.onBossAbilityStart = function (socket,data)
{
  var abilityID = parseInt(data.abilityID, 10);
  var characterID = parseInt(data.characterID, 10);
  var target = data.target;
  if (isNaN(abilityID) || isNaN(characterID) || ((!target.hasOwnProperty("x") || !target.hasOwnProperty("y")) ||
  !target.hasOwnProperty("toggle"))) {
    return;
  }
  this.players.forEach(function (player) {
    characters.forEach(function (character) {
      if (character.type == "boss" && character.id == characterID &&
        player.socketID == socket.id && Finder.GetAccountIDFromSocketID(this.players, socket.id) == character.owner) {
        if (!character.stunned && !isNaN(abilityID) && abilityID < character.boss.abilities.length) {
          data.characters = characters;
          data.game_uuid = game_uuid;
          data.io = this.io;
          data.character = character;
          data.abilityID = abilityID;
          character.boss.abilities[abilityID](data);
        }
        return;
      }
    });
  });
};

Room.prototype.stop = function () {
// TODO : disconnect players, close socket, update redis, shutdown room
};

module.exports = Room;