(function() {
    //////////// Content?
    //////////// Constants and shit
    const GROUND_HEIGHT = 32;

    const LINE_PARROT = false;
    const DEBUG_DOTS = false;

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
    }

    const directions = {
        down:  new Vec2(0, -1),
        left:  new Vec2(-1, 0),
        right: new Vec2(1, 0),
        up:    new Vec2(0, 1),
    };
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

    const PARROT_BEAK = PARROT_BEAK_RAW.map(
        function (v) { return v.scale(1/PARROT_SCALE); });
    const PARROT_FEET = PARROT_FEET_RAW / PARROT_SCALE;

    function deg(f) { return f * Math.PI / 180; }

    function xToScreen(x) { return x; }
    function yToScreen(y) {
        return canvas.height - GROUND_HEIGHT - y;
    }
    function toScreen(v) {
        return [xToScreen(v.x), yToScreen(v.y)];
    }

    function getRandom(min, max) {
        return Math.random() * (max - min) + min;
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
    var game = {birb: null, noobs: [], nextCoin: 0.0, score: 0};

    const canvas = $("game");
    const ctx = canvas.getContext("2d");

    const bg = $("bg");

    let birdSprites = [];
    for (let i = 1; i <= 9; i++) {
        birdSprites.push($("pf" + i));
    }

    /////////////////////////////////////////////

    const SCROLL = 2;
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
            this.steps = 0;
            this.flapping = 0;
            this.v = new Vec2(SCROLL, 0);

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
            const feet = LINE_PARROT ? 0 : PARROT_FEET;
            this.crashed = this.p.y <= feet;
            if (this.crashed) {
                this.steps = CRASH_AFRAME * FRAMES_PER;
                this.p.y = feet;
                this.v = new Vec2(0, 0);
                if (!oldCrashed) game.score -= 3;
            } else if (oldCrashed) {
                this.v.x = SCROLL; // XXX
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

            if (this.flapping) {
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

        beakOffset() {
            if (LINE_PARROT) {
                return new Vec2(0, 0);
            } else {
                return PARROT_BEAK[this.getFrame()];
            }
        }
        beakPos() { return this.p.add(this.beakOffset()); }

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
            ctx.drawImage(
                sprite,
                // 0, 0, sprite.width, sprite.height,
                // 317, 40, 1300, 1150,
                ...toScreen(this.p),
                // 17*scale, 11*scale
                sprite.width/scale, sprite.height/scale,
            );
        }

        render(ctx) {
            LINE_PARROT ? this.renderLines(ctx) : this.renderSprite(ctx);

            if (DEBUG_DOTS) {
                dot(ctx, "green", this.p);
                dot(ctx, "blue", this.beakPos());

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
            if (game.birb.beakPos().sub(this.p).mag() <= this.size*1.1) {
                game.score++;
                return true;
            }
        }

        render(ctx) {
            dot(ctx, "#FFC800", this.p, this.size);
        }
    };

    //////////////////////////////////////////////
    function gameSetup() {
        game.birb = new Bird({
            p: new Vec2(0, canvas.height*0.40),
        });
    }

    ///////////////////////////////////////////////
    function getTiles(abbrevs, key) {
        var l = abbrevs[key];
        if (!l) return [];
        return Array.isArray(l) ? l : [l];
    }

    function drawBg() {
        const TILE = GROUND_HEIGHT;
        for (var x = -1; x < canvas.width/TILE + 1; x++) {
            const y = -1;

            ctx.drawImage(
                bg, 0, 0, bg.width, bg.height,
                x*TILE - (game.birb.p.x % TILE),
                yToScreen(y*TILE) - TILE,
                TILE, TILE
            )
        }
    }

    function draw() {
        // Draw blue background
        ctx.save();
        ctx.fillStyle = "#87CEEB";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        drawBg();

        // // Sort by y as a painters algorithm type thing.
        // game.noobs.sort(function (n1, n2) { return n1.py - n2.py; });

        ctx.save();
        ctx.translate(canvas.width/4 - game.birb.p.x, 0);
        game.noobs.forEach(function (noob) { noob.render(ctx); });
        game.birb.render(ctx);
        ctx.restore();

        // Draw score
        ctx.font = "48px sans";
        ctx.fillText(game.score.toString(), 20, 50);
    }

    // function getKbdDirection() {
    //     if (kd.W.isDown() || kd.UP.isDown()) return 'up';
    //     if (kd.A.isDown() || kd.LEFT.isDown()) return 'left';
    //     if (kd.D.isDown() || kd.RIGHT.isDown()) return 'right';
    //     if (kd.S.isDown() || kd.DOWN.isDown()) return 'down';
    //     return null;
    // }
    var touched = false;
    function touch(ev, on) {
        ev.preventDefault();
        touched = on;
    }

    function tick(time) {
        game.birb.setFlapping(kd.SPACE.isDown() || touched);
        if (game.birb.p.x > game.nextCoin) {
            let s = game.nextCoin == 0 ? 0.5 : 1;
            let newc = new Coin({
                p: new Vec2(
                    game.birb.p.x + s*canvas.width,
                    getRandom(PARROT_FEET * 1.5, canvas.height-GROUND_HEIGHT),
                ),
                size: 20,
            });
            console.log("new coin at ", newc.p.x);
            game.noobs.push(newc);
            game.nextCoin = game.birb.p.x +
                getRandom(0.2, 0.5)*canvas.width;
        }

        game.noobs = game.noobs.filter(function (noob) {
            return noob.move() !== true;
        });
        game.birb.move();
    }

    function now() { return performance.now(); }

    // this is fucked up
    function runAtFramerate(tick, draw, fps) {
        var interval = Math.floor(1000/fps);
        var last = 0;
        var lastReal = 0;
        var stop = false;
        function cb() {
            if (stop) return;

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

    function init() {
        console.log("DPR: " + window.devicePixelRatio);

        canvas.renderOnAddRemove = false;

        gameSetup();

        // audio.play();

        kd.run(function () { kd.tick(); });
        var stopRunning;
        kd.Q.press(function() {
            // audio.pause();
            stopRunning();
        });
        canvas.addEventListener(
            "touchstart", function(ev) { touch(ev, true) });
        canvas.addEventListener(
            "touchend", function(ev) { touch(ev, false) });
        canvas.addEventListener(
            "touchcancel", function(ev) { touch(ev, false) });

        // kd.M.press(function() {
        //     game.audioOn = !game.audioOn;
        //     audio.volume = game.audioOn ? 1 : 0;
        // });

        $("loading").textContent = "";
        stopRunning = runAtFramerate(tick, draw, 60);
    }
    window.onload = init;


})();
