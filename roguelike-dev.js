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

const display = new ROT.Display({width: 60, height: 25, fontFamily: 'Roboto Mono'});
document.getElementById("game").appendChild(display.getContainer());

function setupKeyboardHandler(display, handler) {
    const canvas = display.getContainer();
    const focusReminder = document.getElementById('focus-reminder');
    canvas.setAttribute('tabindex', "1");
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('blur', () => { focusReminder.style.visibility = 'visible'; });
    canvas.addEventListener('focus', () => { focusReminder.style.visibility = 'hidden'; });
    canvas.focus();
}

function createEntity(type, x, y) {
    let id = ++createEntity.id;
    return { id, type, x, y };
}
createEntity.id = 0;

let player = createEntity('player', 5, 4);
let troll = createEntity('troll', 20, 10);

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
    drawEntity(player);
    drawEntity(troll);
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
            player.x += dx;
            player.y += dy;
            draw();
        } else {
            throw `unhandled action ${action}`;
        }
        event.preventDefault();
    }
}

draw();
setupKeyboardHandler(display, handleKeyDown);
