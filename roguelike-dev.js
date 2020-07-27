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

const STORAGE_KEY = window.location.pathname + '-savegame';

const display = new ROT.Display({width: 60, height: 25, fontSize: 16, fontFamily: 'monospace'});
display.getContainer().setAttribute('id', "game");
document.querySelector("figure").appendChild(display.getContainer());


/** like python's randint */
const randint = ROT.RNG.getUniformInt.bind(ROT.RNG);


/** console messages */
const MAX_MESSAGE_LINES = 100;
let messages = []; // [text, className]
function drawMessages() {
    let messageBox = document.querySelector("#messages");
    // If there are more messages than there are <div>s, add some
    while (messageBox.children.length < messages.length) {
        messageBox.appendChild(document.createElement('div'));
    }
    // Remove any extra <div>s
    while (messages.length < messageBox.children.length) {
        messageBox.removeChild(messageBox.lastChild);
    }
    // Update the <div>s to have the right message text and color
    for (let line = 0; line < messages.length; line++) {
        let div = messageBox.children[line];
        div.textContent = messages[line][0];
        div.setAttribute('class', messages[line][1]);
    }
    // Scroll to the bottom
    messageBox.scrollTop = messageBox.scrollHeight;
}

function print(message, className) {
    messages.push([message, className]);
    messages.splice(0, messages.length - MAX_MESSAGE_LINES);
    drawMessages();
}

/** overlay messages - hide if text is empty, optionally clear automatically */
const [setOverlayMessage, setTemporaryOverlayMessage] = (() => {
    let area = document.querySelector("#message-overlay");
    let timeout = 0;
    function set(text) {
        clearTimeout(timeout);
        area.textContent = text;
        area.classList.toggle('visible', !!text);
    }
    return [
        set,
        function(text) {
            set(text);
            timeout = setTimeout(() => { area.classList.remove('visible'); }, 1000);
        }
    ];
})();

//////////////////////////////////////////////////////////////////////
// entities

/** Entity properties that are shared among all the instances of the type.
    visuals: [char, fg, optional bg, true if can be seen outside fov]
 */
const ENTITY_PROPERTIES = {
    player: { blocks: true, render_order: 5, visuals: ['@', "hsl(60, 100%, 70%)"], },
    stairs: { stairs: true, render_order: 1, visuals: ['>', "hsl(200, 100%, 90%)", undefined, true], },
    troll:  { blocks: true, render_order: 3, visuals: ['T', "hsl(120, 60%, 30%)"], },
    orc:    { blocks: true, render_order: 3, visuals: ['o', "hsl(100, 30%, 40%)"], },
    corpse: { blocks: false, render_order: 0, visuals: ['%', "darkred"], },
    'healing potion': { item: true, render_order: 2, visuals: ['!', "violet"], },
    'lightning scroll': { item: true, render_order: 2, visuals: ['#', "hsl(60, 50%, 75%)"], },
    'fireball scroll': { item: true, render_order: 2, visuals: ['#', "hsl(0, 50%, 50%)"], },
    'confusion scroll': { item: true, render_order: 2, visuals: ['#', "hsl(0, 100%, 75%)"], },
};
/* always use the current value of 'type' to get the entity properties,
    so that we can change the object type later (e.g. to 'corpse') */
const entity_prototype = {
    get item() { return ENTITY_PROPERTIES[this.type].item; },
    get blocks() { return ENTITY_PROPERTIES[this.type].blocks; },
    get visuals() { return ENTITY_PROPERTIES[this.type].visuals; },
    get render_order() { return ENTITY_PROPERTIES[this.type].render_order; },
};

/* Schema:
 * location: {x:int, y:int} | {carried:id, slot:int} -- latter allowed only if .item === true
 * inventory: Array<null|int> - should only contain entities with .item === true
 */
const NOWHERE = {x: -1, y: -1}; // TODO: figure out a better location
let entities = new Map();
function createEntity(type, location, properties={}) {
    let id = ++createEntity.id;
    let entity = Object.create(entity_prototype);
    entity.name = type;
    Object.assign(entity, { id, type, location: {x: NaN, y: NaN}, ...properties });
    moveEntityTo(entity, location);
    entities.set(id, entity);
    return entity;
}
createEntity.id = 0;

/** euclidean distance */
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** return all entities at (x,y) */
function allEntitiesAt(x, y) {
    return Array.from(entities.values()).filter(e => e.location.x === x && e.location.y === y);
}

/** return an item at (x,y) or null if there isn't one */
function itemEntityAt(x, y) {
    let entities = allEntitiesAt(x, y).filter(e => e.item);
    return entities[0] || null;
}

/** return a blocking entity at (x,y) or null if there isn't one */
function blockingEntityAt(x, y) {
    let entities = allEntitiesAt(x, y).filter(e => e.blocks);
    if (entities.length > 1) throw `invalid: more than one blocking entity at ${x},${y}`;
    return entities[0] || null;
}

/** move an entity to a new location, either {x:int y:int} or {carried:id slot:int} */
function moveEntityTo(entity, location) {
    if (entity.location.carried !== undefined) {
        let {carried, slot} = entity.location;
        let carrier = entities.get(carried);
        if (carrier.inventory[slot] !== entity.id) throw `invalid: inventory slot ${slot} contains ${carrier.inventory[slot]} but should contain ${entity.id}`;
        carrier.inventory[slot] = null;
    }
    entity.location = location;
    if (entity.location.carried !== undefined) {
        let {carried, slot} = entity.location;
        let carrier = entities.get(carried);
        if (carrier.inventory === undefined) throw `invalid: moving to an entity without inventory`;
        if (carrier.inventory[slot] !== null) throw `invalid: inventory already contains an item ${carrier.inventory[slot]} in slot ${slot}`;
        carrier.inventory[slot] = entity.id;
    }
    // TODO: add constraints for at most one (player|monster)
    // and at most one (item) in any {x, y}
}

/** inventory is represented as an array with (null | entity.id) */
function createInventoryArray(capacity) {
    return Array.from({length: capacity}, () => null);
}

let player = createEntity(
    'player', {x: 1, y: 5},
    {hp: 30, max_hp: 30, defense: 2, power: 5, inventory: createInventoryArray(26)}
);

function populateRoom(room, maxMonstersPerRoom, maxItemsPerRoom) {
    const numMonsters = randint(0, maxMonstersPerRoom);
    for (let i = 0; i < numMonsters; i++) {
        let x = randint(room.getLeft(), room.getRight()),
            y = randint(room.getTop(), room.getBottom());
        if (!blockingEntityAt(x, y)) {
            let ai = {behavior: 'move_to_player'};
            let [type, props] = randint(0, 3) === 0
                ? ['troll', {hp: 16, max_hp: 16, defense: 1, power: 4, ai}]
                : ['orc',   {hp: 10, max_hp: 10, defense: 0, power: 3, ai}];
            createEntity(type, {x, y}, props);
        }
    }
    
    const numItems = randint(0, maxItemsPerRoom);
    for (let i = 0; i < numItems; i++) {
        let x = randint(room.getLeft(), room.getRight()),
            y = randint(room.getTop(), room.getBottom());
        if (allEntitiesAt(x, y).length === 0) {
            let item_chance = randint(0, 99);
            createEntity(
                item_chance < 75? 'healing potion'
                    : item_chance < 80? 'fireball scroll'
                    : item_chance < 90? 'confusion scroll'
                    : 'lightning scroll', {x, y});
        }
    }
}

function createMap() {
    function key(x, y) { return `${x},${y}`; }
    return {
        _values: {},
        has(x, y) { return this._values[key(x, y)] !== undefined; },
        get(x, y) { return this._values[key(x, y)]; },
        set(x, y, value) { this._values[key(x, y)] = value; },
    };
}

function createTileMap(dungeonLevel, width, height) {
    let tileMap = createMap();
    const digger = new ROT.Map.Digger(width, height);
    digger.create((x, y, contents) =>
        tileMap.set(x, y, {
            walkable: contents === 0,
            wall: contents === 1,
            explored: false,
        })
    );
    tileMap.dungeonLevel = dungeonLevel;
    tileMap.rooms = digger.getRooms();
    tileMap.corridors = digger.getCorridors();

    // Put stairs in the first room
    let [stairX, stairY] = tileMap.rooms[0].getCenter();
    createEntity('stairs', {x: stairX, y: stairY});
    
    // Put monster and items in all the rooms
    for (let room of tileMap.rooms) {
        populateRoom(room, 3, 2);
    }
    
    return tileMap;
}
const WIDTH = 60, HEIGHT = 25;
let tileMap = createTileMap(1, WIDTH, HEIGHT);

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

/** compute a per-tile map of entity visuals */
function computeGlyphMap(entities) {
    let glyphMap = createMap();
    entities = Array.from(entities.values());
    entities.sort((a, b) => a.render_order - b.render_order);
    entities
        .filter(e => e.location.x !== undefined)
        .forEach(e => glyphMap.set(e.location.x, e.location.y, e.visuals));
    return glyphMap;
}

const mapColors = {
    [false]: {[false]: "rgb(50, 50, 150)", [true]: "rgb(0, 0, 100)"},
    [true]: {[false]: "rgb(200, 180, 50)", [true]: "rgb(130, 110, 50)"}
};
function draw() {
    display.clear();

    document.querySelector("#health-bar").style.width = `${Math.ceil(100*player.hp/player.max_hp)}%`;
    document.querySelector("#health-text").textContent = ` HP: ${player.hp} / ${player.max_hp}`;
    
    let lightMap = computeLightMap(player.location, tileMap);
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
                ch = lit || glyph[3] ? glyph[0] : ch;
                fg = glyph[1];
                bg = glyph[2] || bg;
            }
            display.draw(x, y, ch, fg, bg);
        }
    }
}


//////////////////////////////////////////////////////////////////////
// saving and loading

function serializeGlobalState() {
    const saved = {
        entities: Array.from(entities),
        playerId: player.id,
        tileMap: tileMap,
        messages: messages,
        nextEntityId: createEntity.id,
        rngState: ROT.RNG.getState(),
    }; // TODO: message log
    return JSON.stringify(saved);
}

function deserializeGlobalState(json) {
    const reattachEntityPrototype = entry =>
          [entry[0], Object.assign(Object.create(entity_prototype), entry[1])];
    const saved = JSON.parse(json);
    entities = new Map(saved.entities.map(reattachEntityPrototype));
    createEntity.id = saved.nextEntityid;
    player = entities.get(saved.playerId);
    Object.assign(tileMap, saved.tileMap);
    messages = saved.messages;
    ROT.RNG.setState(saved.rngState);
}


//////////////////////////////////////////////////////////////////////
// items

function useItem(entity, item) {
    switch (item.type) {
    case 'healing potion': {
        if (entity.hp === entity.max_hp) {
            print(`You are already at full health`, 'warning');
        } else {
            print(`Your wounds start to feel better!`, 'healing');
            entity.hp = ROT.Util.clamp(entity.hp + 4, 0, entity.max_hp);
            moveEntityTo(item, NOWHERE);
            enemiesMove();
        }
        break;
    }
    case 'lightning scroll': {
        if (castLighting(entity)) {
            moveEntityTo(item, NOWHERE);
            enemiesMove();
            draw();
        }
        break;
    }
    case 'fireball scroll': {
        targetingOverlay.open(
            `Click a location to cast fireball, or <kbd>ESC</kbd> to cancel`,
            (x, y) => {
                if (castFireball(entity, x, y)) {
                    moveEntityTo(item, NOWHERE);
                    enemiesMove();
                }
                targetingOverlay.close();
                draw();
            });
        break;
    }
    case 'confusion scroll': {
        targetingOverlay.open(
            `Click on an enemy to confuse it, or <kbd>ESC</kbd> to cancel`,
            (x, y) => {
                if (castConfusion(entity, x, y)) {
                    moveEntityTo(item, NOWHERE);
                    enemiesMove();
                }
                targetingOverlay.close();
                draw();
            });
        break;
    }
    default: {
        throw `useItem on unknown item ${item}`;
    }
    }
}

function dropItem(entity, item) {
    moveEntityTo(item, player.location); // TODO: only one item per map tile?
    print(`You dropped ${item.name} on the ground`, 'warning');
    enemiesMove();
}


//////////////////////////////////////////////////////////////////////
// combat

function takeDamage(target, amount) {
    target.hp -= amount;
    if (target.hp <= 0) {
        print(`${target.name} dies!`, target.id === player.id? 'player-die' : 'enemy-die');
        target.dead = true;
        target.type = 'corpse';
        target.name = `${target.name}'s corpse`;
        delete target.ai;
    }
}

function attack(attacker, defender) {
    let damage = attacker.power - defender.defense;
    let color = attacker.id === player.id? 'player-attack' : 'enemy-attack';
    if (damage > 0) {
        print(`${attacker.name} attacks ${defender.name} for ${damage} hit points.`, color);
        takeDamage(defender, damage);
    } else {
        print(`${attacker.name} attacks ${defender.name} but does no damage.`, color);
    }
}

/** return true if the item was used */
function castFireball(caster, x, y) {
    const maximum_range = 3;
    const damage = 12;
    let visibleToCaster = computeLightMap(caster.location, tileMap);
    if (!(visibleToCaster.get(x, y) > 0)) {
        print(`You cannot target a tile outside your field of view.`, 'warning');
        return false;
    }

    let visibleFromFireball = computeLightMap({x, y}, tileMap);
    let attackables = Array.from(entities.values())
        .filter(e => e.location.x !== undefined) // on the map
        .filter(e => e.hp !== undefined && !e.dead)
        .filter(e => visibleFromFireball.get(e.location.x, e.location.y) > 0)
        .filter(e => visibleToCaster.get(e.location.x, e.location.y) > 0)
        .filter(e => distance(e.location, {x, y}) <= maximum_range);

    print(`The fireball explodes, burning everything within ${maximum_range} tiles!`, 'player-attack');
    for (let target of attackables) {
        print(`The ${target.name} gets burned for ${damage} hit points.`, 'player-attack');
        takeDamage(target, damage);
    }
    return true;
}

/** return true if the item was used */
function castConfusion(caster, x, y) {
    let visibleToCaster = computeLightMap(caster.location, tileMap);
    if (!(visibleToCaster.get(x, y) > 0)) {
        print(`You cannot target a tile outside your field of view.`, 'warning');
        return false;
    }

    let visibleFromFireball = computeLightMap({x, y}, tileMap);
    let target = blockingEntityAt(x, y);
    if (target && target.hp !== undefined && !target.dead && target.ai) {
        target.ai = {behavior: 'confused', turns: 10};
        print(`The eyes of the ${target.name} look vacant, as it starts to stumble around!`, 'enemy-die');
        return true;
    }
    print(`There is no targetable enemy at that location.`, 'warning');
    return false;
}

/** return true if the item was used */
function castLighting(caster) {
    const maximum_range = 5;
    const damage = 20;
    let visibleToCaster = computeLightMap(caster.location, tileMap);
    let attackables = Array.from(entities.values())
        .filter(e => e.id !== caster.id)
        .filter(e => e.location.x !== undefined) // on the map
        .filter(e => e.hp !== undefined && !e.dead)
        .filter(e => visibleToCaster.get(e.location.x, e.location.y) > 0)
        .filter(e => distance(e.location, caster.location) <= maximum_range);
    attackables.sort((a, b) => distance(a.location, caster.location) - distance(b.location, caster.location));
    let target = attackables[0];
    if (!target) {
        print(`No enemy is close enough to strike.`, 'error');
        return false;
    }
    print(`A lighting bolt strikes the ${target.name} with a loud thunder! The damage is ${damage}`, 'player-attack');
    takeDamage(target, damage);
    return true;
}


//////////////////////////////////////////////////////////////////////
// player actions

function playerPickupItem() {
    let item = itemEntityAt(player.location.x, player.location.y);
    if (!item) {
        print(`There is nothing here to pick up.`, 'warning');
        return;
    }
    
    let slot = player.inventory.indexOf(null); // first open inventory slot
    if (slot < 0) {
        print(`You cannot carry any more. Your inventory is full.`, 'warning');
        return;
    }

    print(`You pick up the ${item.name}!`, 'pick-up');
    moveEntityTo(item, {carried: player.id, slot});
    enemiesMove();

}

function playerMoveBy(dx, dy) {
    let x = player.location.x + dx,
        y = player.location.y + dy;
    if (tileMap.get(x, y).walkable) {
        let target = blockingEntityAt(x, y);
        if (target && target.id !== player.id) {
            attack(player, target);
        } else {
            moveEntityTo(player, {x, y});
        }
        enemiesMove();
    }
}

//////////////////////////////////////////////////////////////////////
// monster actions

function enemiesMove() {
    let lightMap = computeLightMap(player.location, tileMap);
    for (let entity of entities.values()) {
        if (!entity.dead && entity.location.x !== undefined && entity.ai) {
            switch (entity.ai.behavior) {
            case 'move_to_player': {
                if (!(lightMap.get(entity.location.x, entity.location.y) > 0.0)) {
                    // The player can't see the monster, so the monster
                    // can't see the player, so the monster doesn't move
                    continue;
                }
                
                let dx = player.location.x - entity.location.x,
                    dy = player.location.y - entity.location.y;

                // Pick either vertical or horizontal movement randomly
                let stepx = 0, stepy = 0;
                if (randint(1, Math.abs(dx) + Math.abs(dy)) <= Math.abs(dx)) {
                    stepx = dx / Math.abs(dx);
                } else {
                    stepy = dy / Math.abs(dy);
                }
                let x = entity.location.x + stepx,
                    y = entity.location.y + stepy;
                if (tileMap.get(x, y).walkable) {
                    let target = blockingEntityAt(x, y);
                    if (target && target.id === player.id) {
                        attack(entity, player);
                    } else if (target) {
                        // another monster there; can't move
                    } else {
                        moveEntityTo(entity, {x, y});
                    }
                }
                break;
            }
            case 'confused': {
                if (--entity.ai.turns > 0) {
                    let stepx = randint(-1, 1), stepy = randint(-1, 1);
                    let x = entity.location.x + stepx,
                        y = entity.location.y + stepy;
                    if (tileMap.get(x, y).walkable) {
                        if (!blockingEntityAt(x, y)) {
                            moveEntityTo(entity, {x, y});
                        }
                    }
                } else {
                    entity.ai = {behavior: 'move_to_player'};
                    print(`The ${entity.name} is no longer confused!`, 'enemy-attack');
                }
                break;
            }
            default: {
                throw `unknown enemy ai: ${entity.ai}`;
            }
            }
        }
    }
}


//////////////////////////////////////////////////////////////////////
// ui

function createTargetingOverlay() {
    const overlay = document.querySelector(`#targeting`);
    let visible = false;
    let callback = () => { throw `set callback`; };

    function onClick(event) {
        let [x, y] = display.eventToPosition(event);
        callback(x, y);
        // Ugh, the overlay is nice for capturing mouse events but
        // when you click, the game loses focus. Workaround:
        display.getContainer().focus();
    }
    function onMouseMove(event) {
        let [x, y] = display.eventToPosition(event);
        // TODO: feedback
    }
    
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('mousemove', onMouseMove);
    
    return {
        get visible() { return visible; },
        open(instructions, callback_) {
            visible = true;
            callback = callback_;
            overlay.classList.add('visible');
            overlay.innerHTML = `<div>${instructions}</div>`;
        },
        close() {
            visible = false;
            overlay.classList.remove('visible');
        },
    };
}

function createInventoryOverlay(action) {
    const overlay = document.querySelector(`#inventory-${action}`);
    let visible = false;

    function draw() {
        let html = `<ul>`;
        let empty = true;
        player.inventory.forEach((id, slot) => {
            if (id !== null) {
                let item = entities.get(id);
                html += `<li><kbd>${String.fromCharCode(65 + slot)}</kbd> ${item.name}</li>`;
                empty = false;
            }
        });
        html += `</ul>`;
        if (empty) {
            html = `<div>Your inventory is empty. Press <kbd>ESC</kbd> to cancel.</div>${html}`;
        } else {
            html = `<div>Select an item to ${action} it, or <kbd>ESC</kbd> to cancel.</div>${html}`;
        }
        overlay.innerHTML = html;
    }
    
    return {
        get visible() { return visible; },
        open() { visible = true; overlay.classList.add('visible'); draw(); },
        close() { visible = false; overlay.classList.remove('visible'); },
    };
}


function handlePlayerDeadKeys(key) {
    const actions = {
        o:  ['toggle-debug'],
        b:  ['load-game'],
    };
    return actions[key];
}

function handlePlayerKeys(key) {
    const actions = {
        ArrowRight:  ['move', +1, 0],
        ArrowLeft:   ['move', -1, 0],
        ArrowDown:   ['move', 0, +1],
        ArrowUp:     ['move', 0, -1],
        l:           ['move', +1, 0],
        h:           ['move', -1, 0],
        j:           ['move', 0, +1],
        k:           ['move', 0, -1],
        z:           ['move', 0, 0],
        g:           ['pickup'],
        u:           ['inventory-open-use'],
        d:           ['inventory-open-drop'],
        c:           ['save-game'],
    };
    let action = actions[key];
    return action || handlePlayerDeadKeys(key);
}

function handleInventoryKeys(action) {
    return key => {
        if (key === 'Escape') { return [`inventory-close-${action}`]; }
        let slot = key.charCodeAt(0) - 'a'.charCodeAt(0);
        if (0 <= slot && slot < 26) {
            let id = player.inventory[slot];
            if (id !== null) {
                return [`inventory-do-${action}`, id];
            }
        }
        return undefined;
    };
}

function handleTargetingKeys(key) {
    return key === 'Escape'? ['targeting-cancel'] : undefined;
}

function runAction(action) {
    switch (action[0]) {
    case 'move': {
        let [_, dx, dy] = action;
        playerMoveBy(dx, dy);
        break;
    }

    case 'pickup':               { playerPickupItem();           break; }
    case 'inventory-open-use':   { inventoryOverlayUse.open();   break; }
    case 'inventory-close-use':  { inventoryOverlayUse.close();  break; }
    case 'inventory-open-drop':  { inventoryOverlayDrop.open();  break; }
    case 'inventory-close-drop': { inventoryOverlayDrop.close(); break; }
    case 'targeting-cancel':     { targetingOverlay.close();     break; }

    case 'inventory-do-use': {
        let [_, id] = action;
        inventoryOverlayUse.close();
        useItem(player, entities.get(id));
        break;
    };
    case 'inventory-do-drop': {
        let [_, id] = action;
        inventoryOverlayDrop.close();
        dropItem(player, entities.get(id));
        break;
    };
    case 'load-game': {
        let json = window.localStorage.getItem(STORAGE_KEY);
        if (json === null) {
            setTemporaryOverlayMessage("There is no saved game.");
        } else {
            setTemporaryOverlayMessage("Loaded game.");
            deserializeGlobalState(json);
            drawMessages();
            draw();
        }
        break;
    }
    case 'save-game': {
        let json = serializeGlobalState();
        window.localStorage.setItem(STORAGE_KEY, json);
        setTemporaryOverlayMessage("Saved game.");
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

function handleKeyDown(event) {
    let handleKeys =
        targetingOverlay.visible? handleTargetingKeys
        : inventoryOverlayUse.visible? handleInventoryKeys('use')
        : inventoryOverlayDrop.visible? handleInventoryKeys('drop')
        : player.dead? handlePlayerDeadKeys
        : handlePlayerKeys;
    let action = handleKeys(event.key);
    if (action) {
        event.preventDefault();
        runAction(action);
    }
}

function handleMousemove(event) {
    let lightMap = computeLightMap(player.location, tileMap);
    let [x, y] = display.eventToPosition(event); // returns -1, -1 for out of bounds
    let entities = lightMap.get(x, y) > 0.0 ? allEntitiesAt(x, y) : [];
    let text = entities.map(e => e.name).join("\n");
    setOverlayMessage(text);
}

function handleMouseout(event) {
    setOverlayMessage("");
}

function setupInputHandlers(display) {
    const canvas = display.getContainer();
    const instructions = document.getElementById('instructions');
    canvas.setAttribute('tabindex', "1");
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('mousemove', handleMousemove);
    canvas.addEventListener('mouseout', handleMouseout);
    canvas.addEventListener('blur', () => { instructions.textContent = "Click game for keyboard focus"; });
    canvas.addEventListener('focus', () => { instructions.textContent = "Arrow keys to move, g to get, b to load, c to save"; });
    canvas.focus();
}

print("Hello and welcome, adventurer, to yet another dungeon!", 'welcome');
draw();
const inventoryOverlayUse = createInventoryOverlay('use');
const inventoryOverlayDrop = createInventoryOverlay('drop');
const targetingOverlay = createTargetingOverlay();
setupInputHandlers(display);
