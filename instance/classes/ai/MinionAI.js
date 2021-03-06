var Item = require("../Item");

//charaters [mandatory]: array of characters 
//location [mandatory]: Location object
//intPicker [optional]: random picker selector 
var MinionAI = function (characters, location, intPicker) {
    this.location = location;
    this.characters = characters;
    this.intPicker = intPicker ? intPicker : new IntPicker();
    this.setAggroRadius = function (radius) {
        this.aggroRadius = radius;
    };
    this.setMaxDistanceFromHome = function (distance) {
        this.maxDistanceFromHome = distance;
    };
    this.setAggroRadius(5);
    this.setMaxDistanceFromHome(5);

    this.execute = function () {
        var minions = selectMinions(this.characters);
        var knights = selectKnights(this.characters);

        var stateProvider = new MinionStateProvider(knights, this.intPicker);
        for (var i = 0; i < minions.length; i++) {
            var rawMinion = minions[i];
            var state = null;
            if (rawMinion.ai) state = stateProvider.from(rawMinion.ai.state);
            else state = stateProvider.idle();

            var smartMinion = new MinionAdapter(rawMinion, this.location, this.aggroRadius, this.maxDistanceFromHome);
            smartMinion.setState(state);
            smartMinion.behave();
            rawMinion.ai = {"state": smartMinion.getState().asString()};
        }
    };

};

var MinionStateProvider = function (knights, intPicker) {
    this.knights = knights;
    this.intPicker = intPicker;
    this.idle = function () {
        return new IdleState(this, this.knights);
    };
    this.aggro = function () {
        return new AggroState(this, this.knights);
    };
    this.headHome = function () {
        return new HeadHomeState(this, this.knights);
    };
    this.patrol = function () {
        return new PatrolState(this, this.knights, this.intPicker);
    };
    this.from = function (stateString) {
        if (stateString === "IDLE") return this.idle();
        if (stateString === "AGGRO") return this.aggro();
        if (stateString === "HEADHOME") return this.headHome();
        if (stateString === "PATROL") return this.patrol();
        return null;
    }

};

var MinionAdapter = function (minionCharacter, location, aggroRadius, maxDistance, initialState) {
    this.minion = minionCharacter;
    this.location = location;
    this.aggroRadius = aggroRadius;
    this.maxDistance = maxDistance;
    this.state = initialState;
    this.setState = function (aState) {
        this.state = aState;
    };
    this.getState = function () {
        return this.state;
    };
    this.behave = function () {
        this.state.executeOn(this);
    };
    this.goTo = function (position) {
        var dest = [position.x, position.y];
        this.location.UpdateDestination(this.minion, dest);
    };
    this.spawnPosition = function () {
        return this.minion.spawnPosition;
    };
    this.hasHomeAsDestination = function () {
        var path = this.minion.path;
        if (!path) return false;
        if (path.length == 0) return false;
        var destination = path[path.length - 1];
        if (destination[0] != this.spawnPosition().x) return false;
        if (destination[1] != this.spawnPosition().y) return false;
        return true;
    };

    this.hasDestination = function () {
        var path = this.minion.path;
        if (!path) return false;
        if (path.length == 0) return false;
        return true;
    };

    this.walkablePlacesAroundHome = function () {
        var home = this.spawnPosition();
        var ray = this.maxDistance;
        return this.location.walkablePlacesAround(home, ray);
    };

    this.nearestKnightWithinRadius = function (knights) {
        var nearestKnight = null;
        var nearestSqrDist = Number.MAX_VALUE;
        var sqrRadius = Math.pow(this.aggroRadius, 2);
        for (var i = 0; i < knights.length; i++) {
            var knight = knights[i];
            //minion is the center of the circle
            var sqrDist = Math.pow(knight.position.x - this.minion.position.x, 2) + Math.pow(knight.position.y - this.minion.position.y, 2);
            if (sqrDist < sqrRadius && sqrDist < nearestSqrDist) {
                nearestKnight = knight;
                nearestSqrDist = sqrDist;
            }
        }
        return nearestKnight;
    };

    this.hasKnightWithinRadius = function (knights) {
        return this.nearestKnightWithinRadius(knights) != null;
    };

    this.isAtHome = function () {
        return this.isAt(this.spawnPosition());
    };

    this.isAt = function (position) {
        if (this.minion.position.x != position.x) return false;
        if (this.minion.position.y != position.y) return false;
        return true;
    };

    this.isTooFarFromHome = function () {
        var currentPosition = this.minion.position;
        var originalPosition = this.minion.spawnPosition;
        var distance = this.location.distance(originalPosition, currentPosition);
        if (distance <= this.maxDistance) return false;
        return true;
    };

};

var IdleState = function (stateProvider, knights) {
    this.knights = knights;
    this.stateProvider = stateProvider;
    //this.isIdling = function() {return true;};
    this.asString = function () {
        return "IDLE"
    };
    this.executeOn = function (minionAdapter) {
        if (minionAdapter.hasKnightWithinRadius(this.knights)) {
            minionAdapter.setState(this.stateProvider.aggro());
        } else if (minionAdapter.isAtHome()) {
            minionAdapter.setState(this.stateProvider.patrol());
        } else if (minionAdapter.isTooFarFromHome()) {
            minionAdapter.setState(this.stateProvider.headHome());
        } else {
            minionAdapter.setState(this.stateProvider.headHome());
        }
    };
};

var AggroState = function (stateProvider, knights) {
    this.knights = knights;
    this.stateProvider = stateProvider;
    //this.isAggroing = function() {return true;};
    this.asString = function () {
        return "AGGRO"
    };
    this.executeOn = function (minionAdapter) {
        var found = minionAdapter.nearestKnightWithinRadius(this.knights);
        if (found) {
            minionAdapter.goTo(found.position);
        } else {
            minionAdapter.setState(this.stateProvider.idle());
        }
    };
};

var HeadHomeState = function (stateProvider, knights) {
    this.knights = knights;
    this.stateProvider = stateProvider;
    //this.isHeadingHome = function() {return true;};
    this.asString = function () {
        return "HEADHOME"
    };
    this.executeOn = function (minionAdapter) {
        if (minionAdapter.hasKnightWithinRadius(this.knights)) {
            minionAdapter.setState(this.stateProvider.aggro());
        } else if (minionAdapter.isAtHome()) {
            minionAdapter.setState(this.stateProvider.patrol());
        } else if (!minionAdapter.hasHomeAsDestination()) {
            minionAdapter.goTo(minionAdapter.spawnPosition());
        } else {
            //keep going home 
        }
    };
};

var PatrolState = function (stateProvider, knights, intPicker) {
    this.knights = knights;
    this.stateProvider = stateProvider;
    //this.isPatrolling = function() {return true;};
    this.asString = function () {
        return "PATROL"
    };
    this.executeOn = function (minionAdapter) {
        if (minionAdapter.hasKnightWithinRadius(this.knights)) {
            minionAdapter.setState(this.stateProvider.aggro());
        } else if (minionAdapter.isTooFarFromHome()) {
            minionAdapter.setState(this.stateProvider.headHome());
        } else if (!minionAdapter.hasDestination()) {
            var coords = minionAdapter.walkablePlacesAroundHome();

            //remove current position where minion already is.
            ////NOTE: Is necessary to check and remove position that collides with other minion???
            var toRemove = null;
            for (var i = 0; i < coords.length; i++) {
                if (minionAdapter.isAt(coords[i])) {
                    toRemove = i;
                    break;
                }
            }
            if (toRemove) coords = coords.splice(toRemove);
            if (coords.length === 0) return;
            //Pick one random coord TBD
            var index = intPicker.sortBetween(0, coords.length - 1);
            var selected = coords[index];
            minionAdapter.goTo(selected);
        } else {
            // Minion is already following a patrol path
        }
    };
};

var selectMinions = function (characters) {
    var result = [];
    for (var i = 0; i < characters.length; i++) {
        var each = characters[i];
        if (Item.ItemType.isMinion(each.entity)) result.push(each);
    }
    return result;
};
var selectKnights = function (characters) {
    var result = [];
    for (var i = 0; i < characters.length; i++) {
        var each = characters[i];
        if (Item.ItemType.isKnight(each.entity)) result.push(each);
    }
    return result;
};

var IntPicker = function () {
    this.sortBetween = function (min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
};

module.exports = MinionAI;