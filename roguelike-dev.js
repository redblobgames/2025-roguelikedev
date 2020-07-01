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

ROT.RNG.setSeed(127);
const display = new ROT.Display({width: 60, height: 25, fontFamily: 'Roboto Mono'});
document.getElementById("game").appendChild(display.getContainer());




let entities = new Map();
function createEntity(type, x, y) {
    let id = ++createEntity.id;
    let entity = { id, type, x, y };
    entities.set(id, entity);
    return entity;
}
createEntity.id = 0;

let player = createEntity('player', 1, 5);
createEntity('troll', 24, 16);



function createMap(width, height) {
    let map = {
        width, height,
        tiles: new Map(),
        key(x, y) { return `${x},${y}`; },
        get(x, y) { return this.tiles.get(this.key(x, y)); },
        set(x, y, value) { this.tiles.set(this.key(x, y), value); },
    };

    const digger = new ROT.Map.Digger(width, height);
    digger.create((x, y, contents) => map.set(x, y, contents));
    return map;
}
let map = createMap(60, 25);

const fov = new ROT.FOV.PreciseShadowcasting((x, y) => map.get(x, y) === 0);

/** return [char, fg, optional bg] for a given entity */
function entityGlyph(entityType) {
    const visuals = {
        player: ['@', "hsl(60, 100%, 70%)"],
        troll: ['T', "hsl(120, 60%, 30%)"],
        orc: ['o', "hsl(100, 30%, 40%)"],
    };
    return visuals[entityType];
}

function draw() {
    display.clear();

    let lightMap = new Map(); // map key to 0.0–1.0
    fov.compute(player.x, player.y, 10, (x, y, r, visibility) => {
        lightMap.set(map.key(x, y), visibility);
    });

    let glyphMap = new Map(); // map key to [char, fg, optional bg]
    for (let entity of entities.values()) {
        glyphMap.set(map.key(entity.x, entity.y), entityGlyph(entity.type));
    }
    
    const mapColors = {
        [false]: {[false]: "rgb(50, 50, 150)", [true]: "rgb(0, 0, 100)"},
        [true]: {[false]: "rgb(200, 180, 50)", [true]: "rgb(130, 110, 50)"}
    };
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            let lit = lightMap.get(map.key(x, y)) > 0.0,
                wall = map.get(x, y) !== 0;
            let ch = ' ',
                fg = "black",
                bg = mapColors[lit][wall];
            let glyph = glyphMap.get(map.key(x, y));
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
    };
    let action = actions[keyCode];
    return action ? action() : undefined;
}

function handleKeyDown(event) {
    let action = handleKeys(event.keyCode);
    if (action) {
        if (action[0] === 'move') {
            let [_, dx, dy] = action;
            let newX = player.x + dx,
                newY = player.y + dy;
            if (map.get(newX, newY) === 0) {
                player.x = newX;
                player.y = newY;
            }
            draw();
        } else {
            throw `unhandled action ${action}`;
        }
        event.preventDefault();
    }
}

function setupKeyboardHandler(display, handler) {
    const canvas = display.getContainer();
    const focusReminder = document.getElementById('focus-reminder');
    canvas.setAttribute('tabindex', "1");
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('blur', () => { focusReminder.style.visibility = 'visible'; });
    canvas.addEventListener('focus', () => { focusReminder.style.visibility = 'hidden'; });
    canvas.focus();
}

draw();
setupKeyboardHandler(display, handleKeyDown);
