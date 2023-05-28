(function() {
    //////////// Content?
    //////////// Constants and shit

    var BG_TILE = 128;
    var TILE = 32;
    var X_TILES = 30;
    var Y_TILES = 20;

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
            return this.dot(this)
        }
        mag() {
            return Math.sqrt(this.mag2())
        }
        norm() {
            return this.scale(1/this.mag())
        }
        angle() {
            return Math.atan2(this.y, this.x);
        }
    }

    var directions = {
        down:  new Vec2(0, -1),
        left:  new Vec2(-1, 0),
        right: new Vec2(1, 0),
        up:    new Vec2(0, 1),
    };

    function deg(f) { return f * Math.PI / 180 }

    function xToScreen(x) { return x; }
    function yToScreen(y) {
        return (TILE*(Y_TILES-1)) - y;
    }
    function toScreen(v) {
        return new Vec2(xToScreen(v.x), yToScreen(v.y));
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

    const STOP_FRAME = 5;

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
            return Math.floor(this.steps / 3) % 9;
        }

        move() {
            if (!this.moving) return;

            let oldCrashed = this.crashed;
            this.crashed = this.p.y <= 0;
            if (this.crashed) {
                this.p.y = 0;
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

            // Manage bird angle
            const N = 20;
            let cnt = this.steps % (N*2);
            if (cnt > N) {
                cnt = N - (cnt - N);
            }
            const lo = 20;
            const hi = 50;
            this.wing_angle = deg(lo + (hi-lo)*(cnt/N));
        }

        renderLines(ctx) {
            //console.log(this);
            ctx.save();
            ctx.strokeStyle = "green";
            ctx.translate(xToScreen(this.p.x), yToScreen(this.p.y));
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
                xToScreen(this.p.x),
                yToScreen(this.p.y),
                // 17*scale, 11*scale
                sprite.width/scale, sprite.height/scale,
            );

            ctx.save();
            ctx.fillStyle = "green";
            ctx.beginPath();
            ctx.ellipse(xToScreen(this.p.x), yToScreen(this.p.y),
                        4, 4, 0, 0, 2*Math.PI);
            ctx.fill();
            ctx.restore();
        }

        render(ctx) { this.renderSprite(ctx) }

    };

    class Coin {
        constructor(obj) {
            this.v = new Vec2(0, 0);
            // Is this bullshit?
            for (let elem in obj) this[elem] = obj[elem];
        }

        move() {
            if (game.birb.p.sub(this.p).mag() <= this.size) {
                game.score++;
                return true;
            }
        }

        render(ctx) {
            ctx.save();
            ctx.fillStyle = "#FFC800";
            ctx.beginPath();
            ctx.ellipse(xToScreen(this.p.x), yToScreen(this.p.y),
                        this.size, this.size, 0, 0, 2*Math.PI);
            ctx.fill();

            ctx.restore();
        }
    };

    //////////////////////////////////////////////
    function gameSetup() {
        game.birb = new Bird({
            p: new Vec2(0, 7*TILE),
        });
        game.noobs.push(game.birb);
    }

    ///////////////////////////////////////////////
    function getTiles(abbrevs, key) {
        var l = abbrevs[key];
        if (!l) return [];
        return Array.isArray(l) ? l : [l];
    }

    function drawBg() {
        for (var x = -1; x < X_TILES + 1; x++) {
            const y = -1;

            ctx.drawImage(
                bg, 0, 0, BG_TILE, BG_TILE,
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
        ctx.translate((X_TILES/4)*TILE - game.birb.p.x, 0);
        game.noobs.forEach(function (noob) { noob.render(ctx); });
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
                p: new Vec2(game.birb.p.x + s*canvas.width,
                            Math.random()*(canvas.height-TILE)),
                size: 20,
            });
            console.log("new coin at ", newc.p.x);
            game.noobs.push(newc);
            game.nextCoin = game.birb.p.x +
                (Math.random()*0.3 + 0.2)*canvas.width;
        }

        game.noobs = game.noobs.filter(function (noob) {
            return noob.move() !== true;
        });
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
        stopRunning = runAtFramerate(tick, draw, 30);
    }
    window.onload = init;


})();
