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

const directions = {
    down:  new Vec2(0, -1),
    left:  new Vec2(-1, 0),
    right: new Vec2(1, 0),
    up:    new Vec2(0, 1),
};

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

/* "Most of what I want from jquery" */
let $ = (s) => { return document.getElementById(s); };

const canvas = $("canvas");
const canvas_width = canvas.width;
const canvas_height = canvas.height;
const glCanvas = $("gl");

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

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius){
    // adapated from
    // https://stackoverflow.com/questions/25837158/how-to-draw-a-star-by-using-canvas-html5
    ctx.save();
    ctx.translate(cx, cy);
    ctx.moveTo(0, 0-outerRadius);
    for (var i = 0; i < spikes; i++) {
        ctx.rotate(Math.PI / spikes);
        ctx.lineTo(0, 0 - innerRadius);
        ctx.rotate(Math.PI / spikes);
        ctx.lineTo(0, 0 - outerRadius);
    }
    ctx.restore();
}

function draw(ctx, now) {
    ctx.clear("#ffffff");

    let x = canvas_width/2;
    let y = canvas_height/2;

    ctx.beginPath();
    ctx.fillStyle='skyblue';
    drawStar(ctx, x, y, 5, 60, 30);
    ctx.fill();
    ctx.stroke();
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

function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const canvasCtx = setupFlippedCanvas(
        canvas, {height: canvas_height, width: canvas_width});
    const glCtx = setupGL(
        glCanvas, {height: canvas_height, width: canvas_width});

    setupDpr(canvas, canvasCtx);
    setupDpr(glCanvas, glCtx);

    canvas.renderOnAddRemove = false;

    $("loading").textContent = "";
    runAtFramerate(
        () => {},
        (now) => {
            trackFps(now);
            draw(canvasCtx, now);
            draw(glCtx, now);
        },
        () => { return 60 }
    );
}

window.onload = init;
