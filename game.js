(function() {
    //////////// Content?
    //////////// Constants and shit
    const GROUND_HEIGHT = 80;
    const DEFAULT_FPS = 60;
    const COIN_SIZE = 20;
    const BEAK_SIZE = 4;
    const HEAD_SIZE = 8;
    const SPEED = 3.5;

    const CONFIG = {
        // LINE_PARROT: true,
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
    console.log(PARROT_CENTER_RAW.y);
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

    function xToScreen(x) { return x; }
    function yToScreen(y) { return -y; }
    function toScreen(v) {
        return [xToScreen(v.x), yToScreen(v.y)];
    }

    function getRandom(min, max) {
        return Math.random() * (max - min) + min;
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


    /////////////// Globals?

    /* "Most of what I want from jquery" */
    var $ = function(s) { return document.getElementById(s); };

    // Lol.
    var game = {birb: null, noobs: [], nextCoin: -1, nextCloud: 0, score: 0};

    const canvas = $("game");
    const ctx = canvas.getContext("2d");
    const canvas_width = canvas.width;
    const canvas_height = canvas.height;

    let groundSprites = [];
    for (let i = 1; i <= 3; i++) {
        groundSprites.push($("plant" + i));
    }
    let bg = groundSprites[2];

    let birdSprites = [];
    for (let i = 1; i <= 9; i++) {
        birdSprites.push($("pf" + i));
    }
    let cloudSprites = [];
    for (let i = 1; i <= 3; i++) {
        cloudSprites.push($("cloud" + i));
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

        move() {
            if (!this.moving) return;

            let oldCrashed = this.crashed;
            const feet = conf.LINE_PARROT ? 0 : PARROT_FEET;
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
            // console.log(this.v.x + ", " + this.v.y);

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
            return this.crashed ? 0 : -this.v.angle() + deg(27);
        }

        rawBeakOffset() {
            if (conf.LINE_PARROT) {
                return new Vec2(0, 0);
            } else {
                return PARROT_BEAK[this.getFrame()].sub(PARROT_CENTER);
            }
        }
        beakOffset() {
            return this.rawBeakOffset().rotate(-this.flightAngle());
        }
        beakPos() { return this.p.add(this.beakOffset()); }
        headPos() {
            return this.rawBeakOffset().sub(new Vec2(10, -2))
                .rotate(-this.flightAngle()).add(this.p);
        }

        renderLines(ctx) {
            //console.log(this);
            ctx.save();
            ctx.strokeStyle = "green";
            ctx.translate(...toScreen(this.p));
            ctx.rotate(this.crashed ? 0 : -this.v.angle());
            const len = 30;
            const wangle = this.wing_angle;
            ctx.beginPath();
            ctx.moveTo(-Math.cos(wangle)*len, -Math.sin(wangle)*len);
            ctx.lineTo(0, 0);
            ctx.lineTo(-Math.cos(wangle)*len, Math.sin(wangle)*len);
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
            conf.LINE_PARROT ? this.renderLines(ctx) : this.renderSprite(ctx);

            if (conf.DEBUG_DOTS) {
                dot(ctx, "green", this.p);
                dot(ctx, "blue", this.beakPos(), this.beakSize);
                dot(ctx, "blue", this.headPos(), this.headSize);

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

    class Coin {
        constructor(obj) {
            this.v = new Vec2(0, 0);
            // Is this bullshit?
            for (let elem in obj) this[elem] = obj[elem];
        }

        move() {
            let birb = game.birb;
            if (birb.beakPos().sub(this.p).mag() <= this.size+birb.beakSize) {
                game.score++;
                return true;
            }
        }

        render(ctx) {
            dot(ctx, "#FFC800", this.p, this.size);
        }
    };

    class Bg {
        constructor(obj) {
            for (let elem in obj) this[elem] = obj[elem];
            if (this.center) {
                this.offs = new Vec2(
                    -this.sprite.width/this.scale/2,
                    this.sprite.height/this.scale/2,
                );
            } else {
                this.offs = new Vec2(
                    0, this.sprite.height/this.scale
                );
            }
        }

        move() {}

        render(ctx) {
            let sprite = this.sprite;

            ctx.save();
            ctx.translate(...toScreen(this.p));
            ctx.drawImage(
                sprite,
                ...toScreen(this.offs),
                sprite.width/this.scale, sprite.height/this.scale,
            );
            // dot(ctx, "orange", new Vec2(0, 0), 4);

            ctx.restore();
        }
    };

    function makeCloud() {
        let c = new Bg({
            p: new Vec2(
                game.nextCloud,
                getRandom(0.4, 0.85)*canvas_height,
            ),
            scale: 7,
            sprite: pickRandom(cloudSprites),
            layer: 0,
            center: true,
            zscale: 2,
        });
        game.noobs.push(c);
        game.nextCloud += getRandom(0.1, 0.5)*canvas_width;
        // console.log("new cloud at ", c.p.x);
    }
    function makeCoin() {
        let c = new Coin({
            p: new Vec2(
                game.nextCoin,
                getRandom(PARROT_FEET * 1.5,
                          canvas_height-GROUND_HEIGHT-COIN_SIZE),
            ),
            size: COIN_SIZE,
            layer: 0.5,
            zscale: 1,
        });
        game.noobs.push(c);
        game.nextCoin += getRandom(0.2, 0.5)*canvas_width;
        // console.log("new coin at ", c.p.x);
    }

    function makeGround() {
        let sprite = pickRandom(groundSprites);
        let n = new Bg({
            p: new Vec2(
                game.nextGround,
                -GROUND_HEIGHT,
            ),
            sprite: sprite,
            layer: 3 + getRandom(-0.1, 0.1), // XXX too far forward?
            zscale: 1,
            scale: sprite.height/GROUND_HEIGHT,
        });
        game.nextGround += sprite.width/n.scale*0.9;
        game.noobs.push(n);
    }

    //////////////////////////////////////////////
    function gameSetup() {
        game.birb = new Bird({
            p: new Vec2(0, PARROT_FEET),
            crashed: true,
            beakSize: BEAK_SIZE,
            headSize: HEAD_SIZE,
            layer: 1,
            zscale: 1,
        });
        game.noobs.push(game.birb);

        game.nextCoin = 500;
        for (let i = 0; i < 5; i++) {
            makeCoin();
        }
        game.nextCloud = -canvas_width;
        while (game.nextCloud < canvas_width*2) {
            makeCloud();
        }
        game.nextGround = -canvas_width;
        while (game.nextGround < canvas_width*2) {
            makeGround();
        }
    }

    ///////////////////////////////////////////////
    function draw() {
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

        if (spawnPoint > game.nextGround) makeGround();
        if (spawnPoint > game.nextCoin) makeCoin();
        if (spawnPoint2 > game.nextCloud) makeCloud();

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

        const ON = ["touchstart", "mousedown"];
        const OFF = ["touchend", "touchcancel", "mouseup", "mouseout"];
        ON.forEach(function(on) {
            console.log("ON", on);
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
