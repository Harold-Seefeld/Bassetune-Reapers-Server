var CompositeCellPicker = require("./CompositeCellPicker.js");
var SpiralCellPicker = require("./SpiralCellPicker.js");
var NoDuplicateCellPicker = require("./NoDuplicateCellPicker.js");
var DoorCellPicker = require("./DoorCellPicker.js");

function DungeonModePickerFactory(place, pickStrategy) {
    this.place = place;
    this.cells = this.place.walkableCells();
    this.pickStrategy = pickStrategy;
    
    this.pickerForKnights = null;
    this.pickerForDoor = null;
    this.pickerForCreatures = null;
    this.pickerForTraps = null;
    this.pickerForLesserLords = null;

    this.forKnights = function() {
        if (!this.pickerForKnights) {
            var height = this.place.height();
            var width = this.place.width();
            var barycenterRow = this.place.topLeftVertex().rowIndex() + Math.floor(height / 2);
            var barycenterCol = this.place.topLeftVertex().columnIndex() + Math.floor(width / 2);
            this.pickerForKnights = new SpiralCellPicker(height, width, barycenterRow, barycenterCol, this.cells);
        }
        return this.pickerForKnights;
    };

    this.forLords = function() {
        return new NoDuplicateCellPicker(this.cells, this.pickStrategy);
    };

    this.forLesserLords = function() {
        if (!this.pickerForLesserLords) {
            var height = this.place.height();
            var width = this.place.width();
            var barycenterRow = this.place.topLeftVertex().rowIndex() + Math.floor(height / 2);
            var barycenterCol = this.place.topLeftVertex().columnIndex() + Math.floor(width / 2);
            this.pickerForLesserLords = new SpiralCellPicker(height, width, barycenterRow, barycenterCol, this.cells);
        }
        return this.pickerForLesserLords;
    };

    this.forTraps = function() {
        if (!this.pickerForTraps) {
            //Se ha il metodo cellsFacing allora e' una stanza
            var isRoom = place.cellsFacingIncomingCorridor ? true : false;
            if (!isRoom) {
                this.pickerForTraps = new NoDuplicateCellPicker(this.cells, this.pickStrategy);
            } else {
                var compositePicker = new CompositeCellPicker(this.pickStrategy);

                var height = this.place.height();
                var width = this.place.width();
                
                var facingCells = this.place.cellsFacingIncomingCorridor();
                var size = facingCells.length;
                if (size != 0) {
                    var middle = Math.ceil(size / 2) - 1;
                    var baryCell = facingCells[middle];
                    var barycenterRow = baryCell.rowIndex();
                    var barycenterCol = baryCell.columnIndex();
                    compositePicker.addPicker(new SpiralCellPicker(height, width, barycenterRow, barycenterCol, this.cells));
                }

                var facingCells = this.place.cellsFacingOutcomingCorridor();
                var size = facingCells.length;
                if (size != 0) {
                    var middle = Math.ceil(size / 2) - 1;
                    var baryCell = facingCells[middle];
                    var barycenterRow = baryCell.rowIndex();
                    var barycenterCol = baryCell.columnIndex();
                    compositePicker.addPicker(new SpiralCellPicker(height, width, barycenterRow, barycenterCol, this.cells));
                }
                this.pickerForTraps = compositePicker;
            }
        }
        return this.pickerForTraps;
    };

    this.forCreatures = function() {
        if (!this.pickerForCreatures) {
            this.pickerForCreatures = new NoDuplicateCellPicker(this.cells, this.pickStrategy);
        }
        return this.pickerForCreatures;
    };

    this.forLordDoor = function() {
        if (!this.pickerForDoor) {
            this.pickerForDoor = new DoorCellPicker(this.place, this.pickStrategy);
        }
        return this.pickerForDoor;
    };
} 

module.exports = DungeonModePickerFactory;
