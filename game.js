import { setupGL, setupFlippedCanvas } from "./gl.js";

//////////// Content?
//////////// Constants and shit
const GROUND_HEIGHT = 90;
const GROUND_HEIGHT_DRAWN = 120;
const DEFAULT_FPS = 60;
const NOTE_SIZE = 50;
const BEAK_SIZE = 4;
const HEAD_SIZE = 8;
const SPEED = 3.5;

const CONFIG = {
    // TRIANGLE_BIRD: true,
    // DEBUG_DOTS: true,
    // FPS: 30,
    // DEBUG_MOVEMENT: true,
};

const configHandler = {
    get(target, name) {
        if (target[name] === undefined) {
            let elem = $(name.toLowerCase());
            let val;
            if (elem.className == "bool") {
                val = elem.checked;
            } else if (elem.className == "int") {
                val = parseInt(elem.value);
            } else if (elem.className == "float") {
                val = parseFloat(elem.value);
            }
            return val;
        } else {
            return target[name];
        }
    }
};
const conf = new Proxy(CONFIG, configHandler);

/////////////// Functions?

class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    scale(f) {
        return new Vec2(this.x*f, this.y*f);
    }
    add(rhs) {
        return new Vec2(this.x+rhs.x, this.y+rhs.y);
    }
    sub(rhs) {
        return new Vec2(this.x-rhs.x, this.y-rhs.y);
    }
    dot(rhs) {
        return this.x*rhs.x + this.y*rhs.y;
    }
    mag2() {
        return this.dot(this);
    }
    mag() {
        return Math.sqrt(this.mag2())
    }
    norm() {
        return this.scale(1/this.mag());
    }
    angle() {
        return Math.atan2(this.y, this.x);
    }
    rotate(theta) {
        return new Vec2(
            this.x*Math.cos(theta) - this.y*Math.sin(theta),
            this.x*Math.sin(theta) + this.y*Math.cos(theta),
        );
    }
}
const ZERO_VEC = new Vec2(0, 0);

const directions = {
    down:  new Vec2(0, -1),
    left:  new Vec2(-1, 0),
    right: new Vec2(1, 0),
    up:    new Vec2(0, 1),
};

const PARROT_RAW_Y = 1452;
const PARROT_CENTER_RAW = new Vec2(1210, -607+PARROT_RAW_Y);
const PARROT_BEAK_RAW = [
    new Vec2(1425, -549),
    new Vec2(1425, -549),

    new Vec2(1481, -493),
    new Vec2(1481, -493),

    new Vec2(1422, -545),

    new Vec2(1430, -545),
    new Vec2(1430, -545),
    new Vec2(1430, -545),
    new Vec2(1430, -545),
];
PARROT_BEAK_RAW.forEach((v) => v.y += PARROT_RAW_Y);
const PARROT_FEET_RAW = PARROT_RAW_Y - 900; // eh, approximate
const PARROT_FILE_SCALE = 0.24;
const PARROT_SCALE = 1/(PARROT_FILE_SCALE/2);

const PARROT_CENTER = PARROT_CENTER_RAW.scale(1/PARROT_SCALE);
const PARROT_BEAK = PARROT_BEAK_RAW.map(
    (v) => { return v.scale(1/PARROT_SCALE); });
const PARROT_FEET = (PARROT_CENTER_RAW.y - PARROT_FEET_RAW) / PARROT_SCALE;

function deg(f) { return f * Math.PI / 180; }
function clamp(val, min, max) { return Math.min(Math.max(min, val), max); }

function toScreen(v) { return [v.x, v.y]; }

function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}
function randBool() {
    return Math.random() < 0.5;
}
function pickRandom(opts) {
    return opts[Math.floor(getRandom(0, opts.length))];
}

function dot(ctx, color, pos, radius) {
    radius = radius || 4;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(...toScreen(pos), radius, radius, 0, 0, 2*Math.PI);
    ctx.fill();
    ctx.restore();
}

function arrow(ctx, color, pos, vec) {
    const mag = vec.mag();
    if (!mag) return;

    ctx.save();
    ctx.fillStyle = color;
    ctx.translate(...toScreen(pos));
    ctx.rotate(vec.angle() - Math.PI/2);

    // why draw something with 3 triangles when you could draw it with 8?
    const headSize = Math.min(30, .3*mag);
    const lineHalf = 2;
    const headHalf = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-lineHalf, 0);
    ctx.lineTo(-lineHalf, mag-headSize); //
    ctx.lineTo(-headHalf, mag-headSize); // XXX
    ctx.lineTo(0, mag);
    ctx.lineTo(headHalf, mag-headSize); // XXX
    ctx.lineTo(lineHalf, mag-headSize); //
    ctx.lineTo(lineHalf, 0);
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.restore();
}

function drawText(string, font, pos) {
    let tgtHeight = 48;
    let refHeight = font[0].height;
    let scale = refHeight/tgtHeight;

    for (let i = 0; i < string.length; i++) {
        // console.log(pos);
        let c = string.charAt(i);
        let idx = c == "-" ? 10 : parseInt(c);
        let glyph = font[idx];
        // console.log(i, c, font, idx, glyph);
        let h = glyph.height/scale;
        ctx.drawImage(glyph, pos.x, pos.y, glyph.width/scale, h);
        pos = pos.add(new Vec2(glyph.width/scale + 3, 0));

    }
}

function circRectIntersect(circPos, rad, rectPos, width, height) {
    let closest = new Vec2(
        clamp(circPos.x, rectPos.x, rectPos.x+width),
        clamp(circPos.y, rectPos.y, rectPos.y+height),
    );
    return (closest.sub(circPos)).mag2() <= rad*rad;
}
function rectContains(pos, rectPos, width, height) {
    return (
        rectPos.x <= pos.x
            && pos.x <= rectPos.x + width
            && rectPos.y <= pos.y
            && pos.y <= rectPos.y + height
    );
}
function circRectHits(circPos, rad, rectPos, width, height) {
    return rectContains(circPos, rectPos, width, height)
        || circRectIntersect(circPos, rad, rectPos, width, height);
}
//
function getImageData(img) {
    let canvas = document.createElement('canvas');
    canvas.height = img.height;
    canvas.width = img.width;
    let ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function processBoundingBoxes(img, slices) {
    let data = getImageData(img).data;
    let width = img.width;
    function px(x, y) { return data[(y*width+x)*4 + 3]; }

    let sliceSize = (img.width/(slices-1)) | 0;
    let boxes = [];
    for (let i = 0; i < slices; i++) {
        let start = sliceSize*i;
        let end = Math.min(start+sliceSize, img.width-1);
        let top = img.height-1;
        let bot = 0;
        for (let y = 0; y < img.height; y++) {
            for (let x = start; x <= end; x++) {
                // if (px(x, y) === undefined) {
                //     console.log(x + "/" + y + ": " + px(x, y));
                // }
                if (px(x, y) != 0) {
                    // console.log(x + "/" + y + ": " + px(x, y));
                    top = Math.min(top, y);
                    bot = Math.max(bot, y);
                }
            }
        }
        let box = {corner: new Vec2(start, img.height-bot),
                   width: end-start, height: bot-top+1};
        // console.log("slice " + i + " has " + JSON.stringify(box) + "/"
        //             + [bot, top]);
        boxes.push(box);
    }

    return boxes;
}

class Loader {
    constructor() {
        this.pending = 0;
        this.onload = null;
    }

    load(path) {
        const img = new Image();
        img.src = path;
        const this_ = this;
        this.pending++;
        img.onload = () => {
            this_.pending--;
            if (this_.pending == 0 && this_.onload) {
                this_.onload();
            }
        };
        return img;
    }

}
const loader = new Loader();

function loadGroup(name, lo, hi) {
    let sprites = [];
    for (let i = lo; i <= hi; i++) {
        sprites.push(loader.load("images/" + name + "/" + i + ".png"));
    }
    return sprites;
}


/////////////// Globals?

/* "Most of what I want from jquery" */
let $ = (s) => { return document.getElementById(s); };

// Lol.
let game = {
    birb: null, noobs: [], score: -0, penalized: false, started: false,
    spawners: [],
};

const canvas = $("game");
const canvas_width = canvas.width;
const canvas_height = canvas.height;
// XXX: Should this *not* be a global?
let ctx = null;

let groundSprites = loadGroup("bg", 1, 3);
let groundOffsets = [-5, -30, -5];
for (let i = 0; i < groundSprites.length; i++) {
    groundSprites[i].offset = groundOffsets[i];
}

let birdSprites = loadGroup("pf", 1, 9);
let cloudSprites = loadGroup("cloud", 1, 5);
let noteSprites = loadGroup("note", 1, 3);
let hillSprites = loadGroup("hill", 1, 4);
let mtnSprites = loadGroup("mtn", 1, 3);
let redFont = loadGroup("font", 0, 10);
let orangeFont = loadGroup("font", 11, 21);
let introSprite = loader.load("images/intro.png");

/////////////////////////////////////////////

const G = 0.2;
const FLAP = 3;
const FLAP_A = 0.5;

const FRAMES_PER = 3
const AFRAMES = 9;
const STOP_AFRAME = 5;
const CRASH_AFRAME = 8;

const FREEZE_FRAMES = 5;
const THAW_FRAMES = 300;

////////////////////////////////////////////////////////////
class Bird {
    constructor(obj) {
        this.moving = true;
        this.crashed = false;
        this.steps = FRAMES_PER*STOP_AFRAME;
        this.flapping = 0;
        this.v = new Vec2(conf.SPEED, 0);

        this.hit = false;
        this.freeze = 0.0;

        this.gravity = directions.down.scale(G);
        this.lift = ZERO_VEC;

        // Is this bullshit?
        for (let elem in obj) this[elem] = obj[elem];
    }


    setFlapping(flapping) {
        this.flapping = flapping;
    }

    getFrame() {
        return Math.floor(this.steps / FRAMES_PER) % AFRAMES;
    }
    headSize() {
        return conf.TRIANGLE_BIRD ? 0 : HEAD_SIZE;
    }
    beakSize() { return BEAK_SIZE; }

    move() {
        if (!this.moving) return;

        let oldCrashed = this.crashed;
        const feet = conf.TRIANGLE_BIRD ? 0 : PARROT_FEET;
        this.crashed = this.p.y <= feet;
        if (this.crashed) {
            this.steps = CRASH_AFRAME * FRAMES_PER;
            this.p.y = feet;
            this.v = new Vec2(0, 0);
            if (!oldCrashed) {
                game.score -= 3;
                game.penalized = true;
            }
        } else if (oldCrashed) {
            this.v.x = conf.SPEED; // XXX
        }

        // XXX
        if (!conf.DEBUG_MOVEMENT) {
            this.p = this.p.add(this.v);
        }

        // XXX: Debug! Sideways velocity!
        let side = 0;
        if (kd.A.isDown() || kd.LEFT.isDown()) side -= 0.2;
        if (kd.D.isDown() || kd.RIGHT.isDown()) side += 0.2;
        this.v = this.v.add(directions.right.scale(side));

        if (this.flapping) {
            let amt = G;
            if (this.v.y < FLAP) amt += FLAP_A;
            this.lift = directions.up.scale(amt);
            if (this.crashed && oldCrashed) {
                this.p.y += 1;
            }
        } else {
            this.lift = ZERO_VEC;
        }

        this.v = this.v.add(this.gravity);
        this.v = this.v.add(this.lift);

        if (this.flapping || this.getFrame() != STOP_AFRAME) {
            this.steps++;
        }

        // Manage wing angle
        const N = 20;
        let cnt = this.steps % (N*2);
        if (cnt > N) {
            cnt = N - (cnt - N);
        }
        const lo = 20;
        const hi = 50;
        this.wing_angle = deg(lo + (hi-lo)*(cnt/N));


        //////
        // Logic for freezing
        if (this.hit) {
            this.freeze = Math.min(1.0, this.freeze + 1.0/FREEZE_FRAMES);
        } else {
            this.freeze = Math.max(0.0, this.freeze - 1.0/THAW_FRAMES);
        }

        this.hit = false;

        /////
        if (conf.DEBUG_MOVEMENT) {
            if (kd.A.isDown()) this.p.x -= 2;
            if (kd.D.isDown()) this.p.x += 2;
            if (kd.S.isDown()) this.p.y -= 2;
            if (kd.W.isDown()) this.p.y += 2;
            this.v = new Vec2(1, 0);
        }
    }

    flightAngle() {
        let offset = conf.TRIANGLE_BIRD ? 0 : deg(27);
        return this.crashed ? 0 : (this.v.angle() - offset);
    }

    rawBeakOffset() {
        if (conf.TRIANGLE_BIRD) {
            return new Vec2(20, 0);
        } else {
            return PARROT_BEAK[this.getFrame()].sub(PARROT_CENTER);
        }
    }
    beakOffset() {
        return this.rawBeakOffset().rotate(this.flightAngle());
    }
    beakPos() { return this.p.add(this.beakOffset()); }
    headPos() {
        if (conf.TRIANGLE_BIRD) {
            return this.beakPos();
        } else {
            return this.rawBeakOffset().sub(new Vec2(10, -2))
                .rotate(this.flightAngle()).add(this.p);
        }
    }

    renderLines(ctx) {
        ctx.save();
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.translate(...toScreen(this.p));
        ctx.rotate(this.flightAngle());
        const len = 30;
        const wangle = this.wing_angle;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(wangle)*len, -Math.sin(wangle)*len);
        ctx.lineTo(0, 0);
        ctx.lineTo(-Math.cos(wangle)*len, Math.sin(wangle)*len);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(...toScreen(this.rawBeakOffset()));
        ctx.stroke();
        ctx.restore();
    }

    renderSprite(ctx) {
        let scale = 2;
        let sprite = birdSprites[this.getFrame()];

        ctx.save();
        ctx.translate(...toScreen(this.p));
        ctx.rotate(this.flightAngle());
        ctx.freezeEffect = this.freeze;
        ctx.drawImage(
            sprite,
            -PARROT_CENTER.x, -PARROT_CENTER.y,
            sprite.width/scale, sprite.height/scale,
        );

        ctx.restore();

    }

    render(ctx) {
        conf.TRIANGLE_BIRD ? this.renderLines(ctx) : this.renderSprite(ctx);

        if (conf.DEBUG_DOTS) {
            dot(ctx, "red", this.p);
            dot(ctx, "blue", this.beakPos(), this.beakSize());
            dot(ctx, "blue", this.headPos(), this.headSize());

            const aScale = 200;
            arrow(ctx, "orange", this.p, this.lift.scale(aScale));
            arrow(ctx, "orange", this.p, this.gravity.scale(aScale));
            arrow(ctx, "purple", this.p, this.v.scale(20));

            // ctx.save();
            // ctx.strokeStyle = "orange";
            // ctx.translate(...toScreen(this.p));
            // ctx.beginPath();
            // ctx.moveTo(-birdSprites[0].width/2/2, -PARROT_FEET);
            // ctx.lineTo(0, -PARROT_FEET);
            // ctx.stroke();
            // ctx.restore();
        }
    }
};

class SimpleSprite {
    constructor(obj) {
        for (let elem in obj) this[elem] = obj[elem];

        this.width = this.sprite.width/this.scale;
        this.height = this.sprite.height/this.scale;

        if (this.center) {
            this.offs = new Vec2(
                -this.width/2,
                -this.height/2,
            );
        } else {
            this.offs = new Vec2(0, 0);
        }
        this.drawOffs = this.offs.add(new Vec2(0, this.height));
    }

    move() {}
    renderDebug() {}

    render(ctx) {
        ctx.save();
        ctx.translate(...toScreen(this.p));

        if (this.hflip) {
            ctx.translate(this.width, 0);
            ctx.scale(-1, 1);
        }
        if (this.globalAlpha !== undefined) {
            ctx.globalAlpha = this.globalAlpha;
        }
        ctx.drawImage(
            this.sprite, ...toScreen(this.offs),
            this.width, this.height);

        if (this.active && conf.DEBUG_DOTS) {
            dot(ctx, "red", new Vec2(0, 0));
            ctx.strokeStyle = "blue";
            ctx.beginPath();
            ctx.rect(this.offs.x, this.offs.y, this.width, this.height);
            ctx.stroke();
        }
        if (this.active && conf.DEBUG_DOTS) {
            this.renderDebug();
        }

        ctx.restore();
    }
};

class Note extends SimpleSprite {
    constructor(obj) {
        super(obj);
        this.active = true;
    }

    move() {
        let birb = game.birb;
        let p = this.p.add(this.offs);
        if (
            circRectHits(
                birb.beakPos(), birb.beakSize(),
                p, this.width, this.height
            )
            || circRectHits(
                birb.headPos(), birb.headSize(),
                p, this.width, this.height
            )
        ) {
            game.score++;
            game.penalized = false;
            return true;
        }
    }

    // renderDebug() {
    //     // show the placement cloud exclusion hitbox
    //     ctx.save();
    //     ctx.strokeStyle = "orange";
    //     ctx.beginPath();
    //     ctx.ellipse(
    //         0, 0,
    //         this.nocollide, this.nocollide, 0, 0, 2*Math.PI);
    //     ctx.stroke();
    //     ctx.restore();
    // }

};

const HIT_FRAMES = 3;
class Cloud extends SimpleSprite {
    constructor(obj) {
        super(obj);
        this.active = true;
        this.hit = 0;

        let scale = this.scale;
        let offs = this.offs;//d.add(new Vec2(0, -this.height));
        this.boxes = this.boxes.map((box) => {
            // let v = offs.add(box.corner.scale(1/scale));
            return {
                corner: box.corner.scale(1/scale).add(offs),
                width: box.width / scale,
                height: box.height / scale,
            };
        });
    }

    hits(birb) {
        let birbpos = birb.headPos();
        let size = birb.headSize();
        if (!circRectHits(
            birbpos, size,
            this.p.add(this.offs), this.width, this.height
        )) {
            return false;
        }
        for (let i = 0; i < this.boxes.length; i++) {
            let box = this.boxes[i];

            let corner = this.p.add(box.corner);
            if (
                circRectHits(
                    birbpos, size,
                    corner, box.width, box.height)
            ) {
                return true;
            }
        }
        return false;
    }


    move() {
        // XXX: multiple frame hits?
        if (this.hits(game.birb)) {
            this.hit++;
            if (this.hit == HIT_FRAMES) {
                game.score--;
                game.penalized = true;
            }
            if (this.hit >= HIT_FRAMES) {
                game.birb.hit = true;
            }
        }
    }

    renderDebug() {
        ctx.strokeStyle = "black";
        ctx.beginPath();
        let scale = this.scale;
        let offs = this.offs;
        this.boxes.forEach((box) => {
            let corner = box.corner.add(new Vec2(0, box.height));
            ctx.rect(...toScreen(corner), box.width, -box.height);
        });
        ctx.stroke();
    }
};

class ScrollSpawner {
    constructor(func, start, scale) {
        this.func = func;
        this.next = start;
        this.scale = scale ?? 1;
    }

    make() {
        const [next, obj] = this.func(this.next);
        this.next = next;
        if (obj) {
            game.noobs.push(obj);
        }
    }

    makeUntil(target, scale) {
        scale = scale ?? this.scale;
        target /= scale;
        while (this.next < target) {
            this.make();
        }
    }
};
function makeSpawner(func, start, target, scale) {
    const s = new ScrollSpawner(func, start, scale);
    s.makeUntil(target);
    return s;
}

const CLOUD_ZSCALE = 1;
function makeCloud(next) {
    let params = {
        p: new Vec2(
            next,
            getRandom(0.2, 0.85)*canvas_height,
        ),
        scale: 5,
        sprite: pickRandom(cloudSprites),
        layer: 1.2,
        globalAlpha: 0.5,
        // center: true,
        zscale: CLOUD_ZSCALE,
        // hflip: randBool(),
        hflip: false,
    };
    let c = new SimpleSprite(params);
    for (let i = 0; i < game.noobs.length; i++) {
        let tgt = game.noobs[i];
        if (tgt.nocollide
            && circRectHits(tgt.p, tgt.nocollide, c.p, c.width, c.height))
        {
            game.nextCloud += 0.1*canvas_width;
            return;
        }
    }

    next += getRandom(0.3, 0.6)*canvas_width;
    game.noobs.push(c);
    params.globalAlpha = 1.0;
    params.layer = 0;
    params.boxes = params.sprite.boxes;
    return [next, new Cloud(params)];
}
function makeNote(next) {
    let sprite = pickRandom(noteSprites);
    let c = new Note({
        p: new Vec2(
            next,
            getRandom(GROUND_HEIGHT*0.5,
                      canvas_height-GROUND_HEIGHT-NOTE_SIZE),
        ),
        center: true,
        sprite: sprite,
        scale: sprite.height/NOTE_SIZE,
        layer: 0.5,
        zscale: 1,
        nocollide: NOTE_SIZE,
    });

    for (let i = 0; i < game.noobs.length; i++) {
        let tgt = game.noobs[i];
        if (tgt instanceof Cloud
            && circRectHits(c.p, c.nocollide, tgt.p,
                            tgt.width, tgt.height))
        {
            next += 0.1*canvas_width;
            return [next, null];
        }
    }

    next += getRandom(0.2, 0.5)*canvas_width;
    return [next, c];
}

function makeGround(next) {
    let sprite = pickRandom(groundSprites);
    let n = new SimpleSprite({
        p: new Vec2(
            next + sprite.offset,
            -GROUND_HEIGHT,
        ),
        sprite: sprite,
        // Put the ground in front of the bird so it kind of looks
        // like we land in them
        layer: 3 + getRandom(-0.1, 0.1),
        zscale: 1,
        scale: sprite.height/GROUND_HEIGHT_DRAWN,
        hflip: randBool(),
    });
    next += n.width*0.9 + sprite.offset;
    return [next, n];
    game.noobs.push(n);
}

const HILL_ZSCALE = 4;
function makeHill(next) {
    let sprite = pickRandom(hillSprites);
    let height = getRandom(0.23, 0.425);
    let scale = hillSprites[0].height/(height*canvas_height);
    let n = new SimpleSprite({
        p: new Vec2(next, -GROUND_HEIGHT),
        sprite: sprite,
        layer: -1 + getRandom(-0.1, 0.1), // XXX too far forward?
        zscale: HILL_ZSCALE,
        scale: scale,
        hflip: randBool(),
    });

    next += getRandom(0.35, 0.7)*n.width;
    return [next, n];
}

const MTN_ZSCALE = HILL_ZSCALE*HILL_ZSCALE;
function makeMtn(next) {
    let sprite = pickRandom(mtnSprites);
    let height = 0.775 * getRandom(0.8, 1.2);
    let scale = mtnSprites[2].height/(height*canvas_height);
    let n = new SimpleSprite({
        p: new Vec2(next, -GROUND_HEIGHT),
        sprite: sprite,
        layer: -2 + getRandom(-0.1, 0.1), // XXX too far forward?
        zscale: MTN_ZSCALE,
        scale: scale,
        globalAlpha: 0.5,
    });
    next += getRandom(0.25, 0.65)*n.width;
    return [next, n];
}

//////////////////////////////////////////////
function gameSetup() {
    game.birb = new Bird({
        p: new Vec2(0, PARROT_FEET),
        crashed: true,
        layer: 1,
        zscale: 1,
    });
    game.noobs.push(game.birb);

    const lo = -canvas_width;
    const hi = canvas_width*2;

    game.spawners.push(makeSpawner(makeCloud, lo, hi));
    game.spawners.push(makeSpawner(makeGround, lo, hi));
    game.spawners.push(makeSpawner(makeHill, lo, hi, 2));
    game.spawners.push(makeSpawner(makeMtn, lo, hi, 4));
    game.spawners.push(makeSpawner(makeNote, 500, hi));
}

///////////////////////////////////////////////
const SAMPLE_PERIOD = 1000;
let lastSampleTime;
let frameCount = 0;
function trackFps(now) {
    if (lastSampleTime === undefined) lastSampleTime = now;
    frameCount++;
    if (now >= lastSampleTime + SAMPLE_PERIOD) {
        let measuredFps = frameCount / (now - lastSampleTime) * 1000;
        $("fps_meter").innerHTML = Math.round(measuredFps);
        frameCount = 0;
        lastSampleTime = now;
    }
}

function draw(now) {
    trackFps(now);

    // Draw blue background
    ctx.clear("#87CEEB");

    // Game state -- translated
    ctx.save();
    ctx.translate(0, GROUND_HEIGHT);

    // Sort by layers
    game.noobs.sort((n1, n2) => {
        return ((n1.layer ?? 0) - (n2.layer ?? 0));
    });

    game.noobs.forEach((noob) => {
        ctx.save();
        ctx.translate(canvas_width/4 - game.birb.p.x/noob.zscale, 0);
        noob.render(ctx);
        ctx.restore();
    });

    ctx.restore();

    if (!game.started) {
        let iscale = 4;
        let x = (canvas_width-introSprite.width/iscale)/2;
        let y = canvas_height*(1-0.15)-introSprite.height/iscale;
        ctx.drawImage(
            introSprite, x, y, introSprite.width/iscale, introSprite.height/iscale
        );
    }

    // Draw score
    let font = game.penalized ? redFont : orangeFont;
    drawText(game.score.toString(), font, new Vec2(20, canvas_height-70));

    // let y = canvas_height/2;
    // let x = canvas_width/2;
    // ctx.drawTriangle(x, y, x+50, y, x, y+50);
}

let touched = false;
function touch(ev, on) {
    ev.preventDefault();
    touched = on;
}

function tick(time) {
    let flapping = kd.SPACE.isDown() || touched;
    game.birb.setFlapping(flapping);
    if (flapping) game.started = true;

    let spawnPoint = game.birb.p.x + canvas_width;
    for (const spawner of game.spawners) {
        spawner.makeUntil(spawnPoint);
    }

    game.noobs = game.noobs.filter((noob) => {
        return noob.move() !== true;
    });
    let n = game.noobs.length;
    game.noobs = game.noobs.filter((noob) => {
        let width = noob.width ?? 0;
        return noob.p.x + width > game.birb.p.x/noob.zscale - canvas_width;
    });
}

function now() { return performance.now(); }

// this is fucked up
function runAtFramerate(tick, draw, getFps) {
    let last = 0;
    let lastReal = 0;
    let stop = false;
    function cb() {
        if (stop) return;
        let interval = Math.floor(1000/getFps());

        if (last == null) return;
        let start = now();
        let since = start - lastReal;
        lastReal = start;

        let iters = 0;
        while (last + interval < start) {
            last += interval;
            tick(last);
            iters++;
        }
        // console.log("since last: " + since +
        //             " wanted: " + interval + " time: " + start
        //            + " iters: " + iters);

        draw(start);

        requestAnimationFrame(cb);
    }
    cb();
    let stopRunning = () => { stop = true; };
    return stopRunning;
}

function setupDpr(canvas, ctx) {
    let dpr = window.devicePixelRatio || 1;
    let width = canvas.width;
    let height = canvas.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.dpr = dpr;
    if (ctx.gl) {
        ctx.gl.viewport(0, 0, canvas.width, canvas.height);
    }
    if (ctx.setProjection) {
        ctx.setProjection(canvas.width, canvas.height);
    }
    ctx.scale(dpr, dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
}

const flyImg = loader.load("images/fly.png");
function setupButtons() {
    let fly = $("fly_button");
    let fscale = 2;
    let fwidth = flyImg.width / fscale;
    const flyctx = fly.getContext("2d");
    setupDpr(fly, flyctx);

    let x = (canvas_width-fwidth)/2;

    flyctx.drawImage(flyImg, x, 0, fwidth, flyImg.height/fscale);

    const ON = ["touchstart", "mousedown"];
    const OFF = ["touchend", "touchcancel", "mouseup", "mouseout"];
    ON.forEach((on) => {
        fly.addEventListener(
            on, (ev) => { touch(ev, true) });
    });
    OFF.forEach((off) => {
        fly.addEventListener(
            off, (ev) => { touch(ev, false) });
    });
}

function init() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') == '1') {
        $('debug_config').hidden = '';
    }
    if (urlParams.get('canvas') == '1') {
        ctx = setupFlippedCanvas(
            canvas, {height: canvas_height, width: canvas_width});
    } else {
        ctx = setupGL(canvas, {height: canvas_height, width: canvas_width});
    }

    $("fps").value = DEFAULT_FPS;
    $("speed").value = SPEED;
    cloudSprites.forEach((sprite) => {
        sprite.boxes = processBoundingBoxes(sprite, 25);
    });

    setupDpr(canvas, ctx);

    canvas.renderOnAddRemove = false;

    gameSetup();
    // ctx.willReadFrequently = true;

    // audio.play();

    kd.run(() => { kd.tick(); });
    let stopRunning;
    kd.Q.press(() => {
        // audio.pause();
        stopRunning();
    });
    setupButtons();
    document.addEventListener("keydown", (evt) => {
        if (evt.keyCode == " ".charCodeAt(0)) {
            evt.preventDefault();
        }
    });

    // kd.M.press(function() {
    //     game.audioOn = !game.audioOn;
    //     audio.volume = game.audioOn ? 1 : 0;
    // });

    $("loading").textContent = "";
    stopRunning = runAtFramerate(
        tick, draw, () => { return conf.FPS });
}

loader.onload = init;
