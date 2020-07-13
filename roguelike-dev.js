/*
 * From https://www.redblobgames.com/x/2025-roguelike-dev/
 * Copyright 2020 Red Blob Games <redblobgames@gmail.com>
 * License: Apache-2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * rot.js licensed under BSD 3-Clause "New" or "Revised" License
 * <https://github.com/ondras/rot.js/blob/master/license.txt>
 */
'use strict';

/* global ROT */

let DEBUG_ALL_EXPLORED = false;

ROT.RNG.setSeed(127);
const display = new ROT.Display({width: 60, height: 25, fontFamily: 'Roboto Mono'});
document.getElementById("game").appendChild(display.getContainer());


/** like python's randint */
const randint = ROT.RNG.getUniformInt.bind(ROT.RNG);


/** console messages */
function print(message) {
    const MAX_LINES = 5;
    let messages = document.querySelector("#messages");
    let lines = messages.textContent.split("\n");
    lines.push(message);
    while (lines.length > MAX_LINES) { lines.shift(); }
    messages.textContent = lines.join("\n");
}

/** Entity properties that are shared among all the instances of the type */
const ENTITY_PROPERTIES = {
    player: { blocks: true, visuals: ['@', "hsl(60, 100%, 70%)"], },
    troll:  { blocks: true, visuals: ['T', "hsl(120, 60%, 30%)"], },
    orc:    { blocks: true, visuals: ['o', "hsl(100, 30%, 40%)"], },
};

let entities = new Map();
function createEntity(type, x, y, properties={}) {
    let id = ++createEntity.id;
    let entity = Object.create(ENTITY_PROPERTIES[type]);
    Object.assign(entity, { id, type, x, y, ...properties });
    entities.set(id, entity);
    return entity;
}
createEntity.id = 0;

/** return the entity at (x,y) or null if there isn't one */
function entityAt(x, y) {
    for (let entity of entities.values()) {
        if (entity.x === x && entity.y === y) {
            return entity;
        }
    }
    return null;
}

let player = createEntity('player', 1, 5, {hp: 30, defense: 2, power: 5});

function createMonsters(room, maxMonstersPerRoom) {
    let numMonsters = randint(0, maxMonstersPerRoom);
    for (let i = 0; i < numMonsters; i++) {
        let x = randint(room.getLeft(), room.getRight()),
            y = randint(room.getTop(), room.getBottom());
        if (!entityAt(x, y)) {
            let ai = {behavior: 'move_to_player'};
            let [type, props] = randint(0, 3) === 0
                ? ['troll', {hp: 16, defense: 1, power: 4, ai}]
                : ['orc',   {hp: 10, defense: 0, power: 3, ai}];
            createEntity(type, x, y, props);
        }
    }
}

function createMap() {
    function key(x, y) { return `${x},${y}`; }
    return {
        _values: new Map(),
        has(x, y) { return this._values.has(key(x, y)); },
        get(x, y) { return this._values.get(key(x, y)); },
        set(x, y, value) { this._values.set(key(x, y), value); },
    };
}

function createTileMap(width, height) {
    let tileMap = createMap();
    const digger = new ROT.Map.Digger(width, height);
    digger.create((x, y, contents) =>
        tileMap.set(x, y, {
            walkable: contents === 0,
            wall: contents === 1,
            explored: false,
        })
    );
    tileMap.rooms = digger.getRooms();
    tileMap.corridors = digger.getCorridors();
    return tileMap;
}
const WIDTH = 60, HEIGHT = 25;
let tileMap = createTileMap(WIDTH, HEIGHT);
for (let room of tileMap.rooms) {
    createMonsters(room, 3);
}

const fov = new ROT.FOV.PreciseShadowcasting((x, y) => tileMap.has(x, y) && tileMap.get(x, y).walkable);


function computeLightMap(center, tileMap) {
    let lightMap = createMap(); // 0.0–1.0
    fov.compute(center.x, center.y, 10, (x, y, r, visibility) => {
        lightMap.set(x, y, visibility);
        if (visibility > 0.0) {
            if (tileMap.has(x, y))
            tileMap.get(x, y).explored = true;
        }
    });
    return lightMap;
}

function computeGlyphMap(entities) {
    let glyphMap = createMap(); // [char, fg, optional bg]
    for (let entity of entities.values()) {
        glyphMap.set(entity.x, entity.y, entity.visuals);
    }
    return glyphMap;
}

const mapColors = {
    [false]: {[false]: "rgb(50, 50, 150)", [true]: "rgb(0, 0, 100)"},
    [true]: {[false]: "rgb(200, 180, 50)", [true]: "rgb(130, 110, 50)"}
};
function draw() {
    display.clear();

    let lightMap = computeLightMap(player, tileMap);
    let glyphMap = computeGlyphMap(entities);
    
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            let tile = tileMap.get(x, y);
            if (!tile || (!DEBUG_ALL_EXPLORED && !tile.explored)) { continue; }
            let lit = DEBUG_ALL_EXPLORED || lightMap.get(x, y) > 0.0;
            let ch = ' ',
                fg = "black",
                bg = mapColors[lit][tile.wall];
            let glyph = glyphMap.get(x, y);
            if (glyph) {
                ch = lit? glyph[0] : ch;
                fg = glyph[1];
                bg = glyph[2] || bg;
            }
            display.draw(x, y, ch, fg, bg);
        }
    }
}

function handleKeys(keyCode) {
    const actions = {
        [ROT.KEYS.VK_RIGHT]: () => ['move', +1, 0],
        [ROT.KEYS.VK_LEFT]:  () => ['move', -1, 0],
        [ROT.KEYS.VK_DOWN]:  () => ['move', 0, +1],
        [ROT.KEYS.VK_UP]:    () => ['move', 0, -1],
        [ROT.KEYS.VK_O]:     () => ['toggle-debug'],
    };
    let action = actions[keyCode];
    return action ? action() : undefined;
}

function takeDamage(target, amount) {
    target.hp -= amount;
    if (target.hp <= 0) {
        target.dead = true;
        print(`${target.type} dies!`);
    }
}

function attack(attacker, defender) {
    let damage = attacker.power - defender.defense;
    if (damage > 0) {
        takeDamage(defender, damage);
        print(`${attacker.type} attacks ${defender.type} for ${damage} hit points.`);
    } else {
        print(`${attacker.type} attacks ${defender.type} but does no damage.`);
    }
}

function playerMoveBy(dx, dy) {
    let newX = player.x + dx,
        newY = player.y + dy;
    if (tileMap.get(newX, newY).walkable) {
        let target = entityAt(newX, newY);
        if (target && !target.dead) {
            attack(player, target);
        } else {
            player.x = newX;
            player.y = newY;
        }
        enemiesMove();
    }
}

function enemiesMove() {
    let lightMap = computeLightMap(player, tileMap);
    for (let entity of entities.values()) {
        if (!entity.dead && entity.ai && entity.ai.behavior === 'move_to_player') {
            if (!(lightMap.get(entity.x, entity.y) > 0.0)) {
                // The player can't see the monster, so the monster
                // can't see the player, so the monster doesn't move
                continue;
            }
            if (entity.x === player.x && entity.y === player.y) {
                throw "Invariant broken: monster and player are in same location";
            }
            
            let dx = player.x - entity.x,
                dy = player.y - entity.y;

            // Pick either vertical or horizontal movement randomly
            let stepx = 0, stepy = 0;
            if (randint(1, Math.abs(dx) + Math.abs(dy)) <= Math.abs(dx)) {
                stepx = dx / Math.abs(dx);
            } else {
                stepy = dy / Math.abs(dy);
            }
            let newX = entity.x + stepx, newY = entity.y + stepy;
            if (tileMap.get(newX, newY).walkable) {
                let target = entityAt(newX, newY);
                if (target && target.id === player.id) {
                    attack(entity, player);
                } else if (target) {
                    // another monster there; can't move
                } else {
                    // take a step
                    entity.x = newX;
                    entity.y = newY;
                }
            }
        }
    }
}

function handleKeyDown(event) {
    let action = handleKeys(event.keyCode);
    if (player.dead) {
        print("You are dead.");
        return;
    }
    if (action) {
        event.preventDefault();
        switch (action[0]) {
        case 'move': {
            let [_, dx, dy] = action;
            playerMoveBy(dx, dy);
            break;
        }
        case 'toggle-debug': {
            DEBUG_ALL_EXPLORED = !DEBUG_ALL_EXPLORED;
            break;
        }
        default:
            throw `unhandled action ${action}`;
        }
        draw();
    }
}

function setupKeyboardHandler(display, handler) {
    const canvas = display.getContainer();
    const instructions = document.getElementById('instructions');
    canvas.setAttribute('tabindex', "1");
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('blur', () => { instructions.textContent = "Click game for keyboard focus"; });
    canvas.addEventListener('focus', () => { instructions.textContent = "Arrow keys to move"; });
    canvas.focus();
}

draw();
setupKeyboardHandler(display, handleKeyDown);
