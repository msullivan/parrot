(function() {
    //////////// Content?
    //////////// Constants and shit
    const GROUND_HEIGHT = 90;
    const GROUND_HEIGHT_DRAWN = 120;
    const DEFAULT_FPS = 60;
    const NOTE_SIZE = 20;
    const BEAK_SIZE = 4;
    const HEAD_SIZE = 8;
    const SPEED = 3.5;

    const CONFIG = {
        // TRIANGLE_BIRD: true,
        // DEBUG_DOTS: true,
        // FPS: 30,
    };

    let configHandler = {
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
    let conf = new Proxy(CONFIG, configHandler);

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

    const PARROT_CENTER_RAW = new Vec2(1210, -607);
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
    const PARROT_FEET_RAW = 900; // eh, approximate
    const PARROT_SCALE = 10;

    const PARROT_CENTER = PARROT_CENTER_RAW.scale(1/PARROT_SCALE);
    const PARROT_BEAK = PARROT_BEAK_RAW.map(
        function (v) { return v.scale(1/PARROT_SCALE); });
    const PARROT_FEET = (PARROT_FEET_RAW + PARROT_CENTER_RAW.y) / PARROT_SCALE;

    function deg(f) { return f * Math.PI / 180; }
    function clamp(val, min, max) { return Math.min(Math.max(min, val), max); }

    function xToScreen(x) { return x; }
    function yToScreen(y) { return -y; }
    function toScreen(v) {
        return [xToScreen(v.x), yToScreen(v.y)];
    }

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

    function circRectIntersect(circPos, rad, rectPos, width, height) {
        let closest = new Vec2(
            clamp(circPos.x, rectPos.x, rectPos.x+width),
            clamp(circPos.y, rectPos.y, rectPos.y+width),
        );
        return (closest.sub(circPos)).mag2() < rad*rad;
    }

    /////////////// Globals?

    /* "Most of what I want from jquery" */
    var $ = function(s) { return document.getElementById(s); };

    // Lol.
    var game = {birb: null, noobs: [], nextNote: -1, nextCloud: 0, score: 0};

    const canvas = $("game");
    const ctx = canvas.getContext("2d");
    const canvas_width = canvas.width;
    const canvas_height = canvas.height;

    let groundSprites = [];
    let groundOffsets = [0, -20, 0];
    for (let i = 0; i < 3; i++) {
        groundSprites.push($("plant" + (i+1)));
        groundSprites[i].offset = groundOffsets[i];
    }

    let birdSprites = [];
    for (let i = 1; i <= 9; i++) {
        birdSprites.push($("pf" + i));
    }
    let cloudSprites = [];
    for (let i = 1; i <= 5; i++) {
        cloudSprites.push($("cloud" + i));
    }
    let noteSprites = [];
    for (let i = 1; i <= 3; i++) {
        noteSprites.push($("note" + i));
    }
    let hillSprites = [];
    for (let i = 1; i <= 5; i++) {
        hillSprites.push($("hill" + i));
    }

    /////////////////////////////////////////////

    const G = 0.2;
    const FLAP = 3;
    const FLAP_A = 0.5;

    const FRAMES_PER = 3
    const AFRAMES = 9;
    const STOP_AFRAME = 5;
    const CRASH_AFRAME = 8;

    ////////////////////////////////////////////////////////////
    class Bird {
        constructor(obj) {
            this.moving = true;
            this.crashed = false;
            this.steps = FRAMES_PER*STOP_AFRAME;
            this.flapping = 0;
            this.v = new Vec2(conf.SPEED, 0);

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
                if (!oldCrashed) game.score -= 3;
            } else if (oldCrashed) {
                this.v.x = conf.SPEED; // XXX
            }

            this.p = this.p.add(this.v);

            // XXX: Debug! Sideways velocity!
            var side = 0;
            if (kd.A.isDown() || kd.LEFT.isDown()) side -= 0.2;
            if (kd.D.isDown() || kd.RIGHT.isDown()) side += 0.2;
            this.v = this.v.add(directions.right.scale(side));

            if (this.flapping) {
                let amt = G;
                if (this.v.y < FLAP) amt += FLAP_A;
                this.v = this.v.add(directions.up.scale(amt));
                if (this.crashed && oldCrashed) {
                    this.p.y += 1;
                }
            }

            this.v = this.v.add(directions.down.scale(G));

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
        }

        flightAngle() {
            let offset = conf.TRIANGLE_BIRD ? 0 : deg(27);
            return this.crashed ? 0 : -this.v.angle() + offset;
        }

        rawBeakOffset() {
            if (conf.TRIANGLE_BIRD) {
                return new Vec2(20, 0);
            } else {
                return PARROT_BEAK[this.getFrame()].sub(PARROT_CENTER);
            }
        }
        beakOffset() {
            return this.rawBeakOffset().rotate(-this.flightAngle());
        }
        beakPos() { return this.p.add(this.beakOffset()); }
        headPos() {
            if (conf.TRIANGLE_BIRD) {
                return this.beakPos();
            } else {
                return this.rawBeakOffset().sub(new Vec2(10, -2))
                    .rotate(-this.flightAngle()).add(this.p);
            }
        }

        renderLines(ctx) {
            ctx.save();
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.translate(...toScreen(this.p));
            ctx.rotate(this.crashed ? 0 : -this.v.angle());
            const len = 30;
            const wangle = this.wing_angle;
            ctx.beginPath();
            ctx.moveTo(-Math.cos(wangle)*len, -Math.sin(wangle)*len);
            ctx.lineTo(0, 0);
            ctx.lineTo(-Math.cos(wangle)*len, Math.sin(wangle)*len);
            ctx.stroke();
            ctx.beginPath();
            ctx.lineTo(0, 0);
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
            ctx.drawImage(
                sprite,
                -PARROT_CENTER.x, PARROT_CENTER.y,
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

                // ctx.save();
                // ctx.strokeStyle = "orange";
                // ctx.translate(...toScreen(this.p));
                // ctx.beginPath();
                // ctx.moveTo(birdSprites[0].width/2, PARROT_FEET);
                // ctx.lineTo(0, PARROT_FEET);
                // ctx.stroke();
                // ctx.restore();
            }
        }
    };

    class Hill {
        // left, top, right
        constructor(obj) {
            // Is this bullshit?
            for (let elem in obj) this[elem] = obj[elem];
            this.p = this.right;
        }

        move() {}

        render(ctx) {
            //console.log(this);
            ctx.save();
            ctx.fillStyle = "green";
            ctx.beginPath();
            ctx.moveTo(...toScreen(this.left));
            ctx.lineTo(...toScreen(this.top));
            ctx.lineTo(...toScreen(this.right));
            ctx.fill();
            ctx.restore();
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
                    this.height/2,
                );
            } else {
                this.offs = new Vec2(0, this.height);
            }
        }

        move() {}

        render(ctx) {
            ctx.save();
            ctx.translate(...toScreen(this.p));
            if (this.hflip) {
                ctx.translate(this.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(
                this.sprite, ...toScreen(this.offs), this.width, this.height);

            if (this.active && conf.DEBUG_DOTS) {
                ctx.strokeStyle = "blue";
                ctx.beginPath();
                ctx.rect(...toScreen(this.offs), this.width, this.height);
                ctx.stroke();
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
            if (
                circRectIntersect(
                    birb.beakPos(), birb.beakSize(),
                    this.p, this.width, this.height
                )
                || circRectIntersect(
                    birb.headPos(), birb.headSize(),
                    this.p, this.width, this.height
                )
            ) {
                game.score++;
                return true;
            }
        }
    };

    function makeCloud() {
        let c = new SimpleSprite({
            p: new Vec2(
                game.nextCloud,
                getRandom(0.4, 0.85)*canvas_height,
            ),
            scale: 7,
            sprite: pickRandom(cloudSprites),
            layer: 0,
            center: true,
            zscale: 2,
            hflip: randBool(),
        });
        game.noobs.push(c);
        game.nextCloud += getRandom(0.1, 0.5)*canvas_width;
        // console.log("new cloud at ", c.p.x);
    }
    function makeNote() {
        let sprite = pickRandom(noteSprites);
        let c = new Note({
            p: new Vec2(
                game.nextNote,
                getRandom(PARROT_FEET * 1.5,
                          canvas_height-GROUND_HEIGHT-2*NOTE_SIZE),
            ),
            sprite: sprite,
            scale: sprite.height/(NOTE_SIZE*2),
            // size: NOTE_SIZE,
            layer: 0.5,
            zscale: 1,
        });
        game.noobs.push(c);
        game.nextNote += getRandom(0.2, 0.5)*canvas_width;
        // console.log("new note at ", c.p.x);
    }

    function makeGround() {
        let sprite = pickRandom(groundSprites);
        let n = new SimpleSprite({
            p: new Vec2(
                game.nextGround,
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
        game.nextGround += n.width*0.9 + sprite.offset;
        game.noobs.push(n);
    }

    const HILL_ZSCALE = 4;
    function makeHill() {
        let sprite = pickRandom(hillSprites);
        let n = new SimpleSprite({
            p: new Vec2(game.nextHill, -GROUND_HEIGHT),
            sprite: sprite,
            layer: -1 + getRandom(-0.1, 0.1), // XXX too far forward?
            zscale: HILL_ZSCALE,
            scale: 2,
            hflip: randBool(),
        });

        game.nextHill += getRandom(0.25, 0.5)*n.width;
        game.noobs.push(n);
    }

    // function makeHill() {
    //     let left = new Vec2(game.nextHill, -GROUND_HEIGHT);
    //     let langle = deg(getRandom(20, 45));
    //     let lwidth = getRandom(0.4, 0.7)*canvas_width / 2;
    //     let height = Math.tan(langle) * lwidth;
    //     let rangle = getRandom(0.9, 1.1)*langle;
    //     let rwidth = height/Math.tan(rangle);

    //     let top = left.add(new Vec2(lwidth, height));
    //     let right = left.add(new Vec2(lwidth+rwidth, 0));

    //     let n = new Hill({
    //         left: left,
    //         top: top,
    //         right: right,
    //         layer: -1 + getRandom(-0.1, 0.1), // XXX too far forward?
    //         zscale: HILL_ZSCALE,
    //     });
    //     game.nextHill += getRandom(0.25, 0.5)*(lwidth+rwidth);
    //     game.noobs.push(n);
    // }

    //////////////////////////////////////////////
    function gameSetup() {
        game.birb = new Bird({
            p: new Vec2(0, PARROT_FEET),
            crashed: true,
            layer: 1,
            zscale: 1,
        });
        game.noobs.push(game.birb);

        game.nextNote = 500;
        for (let i = 0; i < 5; i++) {
            makeNote();
        }
        game.nextCloud = -canvas_width;
        while (game.nextCloud < canvas_width*2) {
            makeCloud();
        }
        game.nextGround = -canvas_width;
        while (game.nextGround < canvas_width*2) {
            makeGround();
        }
        game.nextHill = -canvas_width;
        while (game.nextHill < canvas_width*2) {
            makeHill();
        }
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
            $("fps_meter").innerHTML = "FPS: "+Math.round(measuredFps);
            frameCount = 0;
            lastSampleTime = now;
        }
    }

    function draw(now) {
        // trackFps(now);

        // Draw blue background
        ctx.save();
        ctx.fillStyle = "#87CEEB";
        ctx.fillRect(0, 0, canvas_width, canvas_height);
        ctx.restore();

        // Game state -- translated
        ctx.save();
        ctx.translate(0, canvas_height - GROUND_HEIGHT);

        // Sort by layers
        game.noobs.sort(function (n1, n2) {
            return ((n1.layer ?? 0) - (n2.layer ?? 0));
        });

        // ctx.translate(canvas_width/4 - game.birb.p.x, 0);
        game.noobs.forEach(function (noob) {
            // OK yeah this sucks.
            // if (noob == game.birb) {
            //     var data = ctx.getImageData(noob.x|0, noob.y|0, 1, 1).data;
            //     console.log("!", data[0], data[1], data[2]);
            // }

            ctx.save();
            ctx.translate(canvas_width/4 - game.birb.p.x/noob.zscale, 0);
            noob.render(ctx);
            ctx.restore();
        });

        ctx.restore();

        // Draw score
        ctx.font = "48px sans";
        ctx.fillText(game.score.toString(), 20, 50);
    }

    var touched = false;
    function touch(ev, on) {
        ev.preventDefault();
        touched = on;
    }

    function tick(time) {
        game.birb.setFlapping(kd.SPACE.isDown() || touched);

        let spawnPoint = game.birb.p.x + canvas_width;
        let spawnPoint2 = game.birb.p.x/2 + canvas_width;
        let spawnPointH = game.birb.p.x/HILL_ZSCALE + canvas_width;

        if (spawnPoint > game.nextGround) makeGround();
        if (spawnPoint > game.nextNote) makeNote();
        if (spawnPoint2 > game.nextCloud) makeCloud();
        if (spawnPointH > game.nextHill) makeHill();


        game.noobs = game.noobs.filter(function (noob) {
            return noob.move() !== true;
        });
        let n = game.noobs.length;
        game.noobs = game.noobs.filter(function (noob) {
            return noob.p.x > game.birb.p.x/noob.zscale - canvas_width;
        });
    }

    function now() { return performance.now(); }

    // this is fucked up
    function runAtFramerate(tick, draw, getFps) {
        var last = 0;
        var lastReal = 0;
        var stop = false;
        function cb() {
            if (stop) return;
            var interval = Math.floor(1000/getFps());

            if (last == null) return;
            var start = now();
            var since = start - lastReal;
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
        var stopRunning = function() { stop = true; };
        return stopRunning;
    }

    function setupDpr(canvas, ctx) {
        var dpr = window.devicePixelRatio || 1;
        let width = canvas.width;
        let height = canvas.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }

    function setupButtons() {
        let fly = $("fly_button");
        let flyImg = $("fly");
        const FHEIGHT = 100;
        let fscale = (flyImg.height/100);
        let fwidth = flyImg.width / fscale;
        fly.width = fwidth;
        const flyctx = fly.getContext("2d");
        setupDpr(fly, flyctx);

        flyctx.rotate(deg(1));
        flyctx.drawImage(flyImg, 0, 0, fwidth, FHEIGHT);

        const ON = ["touchstart", "mousedown"];
        const OFF = ["touchend", "touchcancel", "mouseup", "mouseout"];
        ON.forEach(function(on) {
            fly.addEventListener(
                on, function(ev) { touch(ev, true) });
        });
        OFF.forEach(function(off) {
            fly.addEventListener(
                off, function(ev) { touch(ev, false) });
        });
    }

    function init() {
        $("fps").value = DEFAULT_FPS;
        $("speed").value = SPEED;

        setupDpr(canvas, ctx);

        canvas.renderOnAddRemove = false;

        gameSetup();
        // ctx.willReadFrequently = true;

        // audio.play();

        kd.run(function () { kd.tick(); });
        var stopRunning;
        kd.Q.press(function() {
            // audio.pause();
            stopRunning();
        });
        setupButtons();
        document.addEventListener("keydown", function(evt) {
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
            tick, draw, function() { return conf.FPS });
    }
    window.onload = init;


})();
