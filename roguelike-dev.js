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

let player = {x: 5, y: 4, ch: '@'};

function drawCharacter(character) {
    let {x, y, ch} = character;
    display.draw(x, y, ch);
}

function draw() {
    display.clear();
    drawCharacter(player);
}

function handleKeyDown(event) {
    const actions = {
        [ROT.KEYS.VK_RIGHT]: () => { player.x++; },
        [ROT.KEYS.VK_LEFT]:  () => { player.x--; },
        [ROT.KEYS.VK_DOWN]:  () => { player.y++; },
        [ROT.KEYS.VK_UP]:    () => { player.y--; },
    };
    if (actions[event.keyCode]) {
        actions[event.keyCode]();
        event.preventDefault();
    }
    draw();
}

draw();
setupKeyboardHandler(display, handleKeyDown);
