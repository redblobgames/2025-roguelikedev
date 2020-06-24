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

ROT.RNG.setSeed(123456);
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

let player = createEntity('player', 5, 5);
createEntity('troll', 17, 10);



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


function drawEntity(entity) {
    const visuals = {
        player: ['@', "hsl(60, 100%, 50%)"],
        troll: ['T', "hsl(120, 60%, 50%)"],
        orc: ['o', "hsl(100, 30%, 50%)"],
    };

    const [ch, fg, bg] = visuals[entity.type];
    display.draw(entity.x, entity.y, ch, fg, bg);
}

function draw() {
    display.clear();
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.get(x, y)) {
                display.draw(x, y, '⨉', "hsl(60, 10%, 40%)", "gray");
            } else {
                display.draw(x, y, '·', "hsl(60, 50%, 50%)", "black");
            }
        }
    }
    for (let entity of entities.values()) {
        drawEntity(entity);
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
