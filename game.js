(function() {
    //////////// Content?
    //////////// Constants and shit

    var BG_TILE = 128;
    var TILE = 32;
    var X_TILES = 20;
    var Y_TILES = 15;

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
    }

    var directions = {
        down:  new Vec2(0, -1),
        left:  new Vec2(-1, 0),
        right: new Vec2(1, 0),
        up:    new Vec2(0, 1),
    };

    function deg(f) { return f * Math.PI / 180 }

    function yToScreen(y) {
        return (TILE*(Y_TILES-1)) - y;
    }
    function toScreen(v) {
        return new Vec2(v.x, yToScreen(v.y));
    }

    /////////////// Globals?

    /* "Most of what I want from jquery" */
    var $ = function(s) { return document.getElementById(s); };

    // Lol.
    var game = {bgOffset: 0, noobs: []};

    const canvas = $("game");
    const ctx = canvas.getContext("2d");

    const bg = $("bg");

    /////////////////////////////////////////////

    const SCROLL = 2;
    const G = 0.2;
    const FLAP = 3;

    ////////////////////////////////////////////////////////////
    class Bird {
        constructor(obj) {
            this.moving = true;
            this.steps = 0;
            this.flapping = 0;
            this.v = new Vec2(0, 0);

            // Is this bullshit?
            for (let elem in obj) this[elem] = obj[elem];
        }


        setFlapping(flapping) {
            this.flapping = flapping;
        }

        move() {
            if (!this.moving) return;

            if (this.p.y < 0 && !this.flapping) {
                this.p.y = 0;
                this.v = new Vec2(0, 0);
            }

            this.p = this.p.add(this.v);

            if (this.flapping) {
                this.v = directions.up.scale(FLAP);
            } else {
                this.v = this.v.add(directions.down.scale(G))
            }

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
            this.angle = deg(lo + (hi-lo)*(cnt/N));
        }

        render(ctx) {
            //console.log(this);
            ctx.save();
            ctx.strokeStyle = "green";
            ctx.translate(this.p.x, yToScreen(this.p.y));
            const len = 30;
            const bangle = this.angle;
            ctx.beginPath();
            ctx.moveTo(-Math.cos(bangle)*len, -Math.sin(bangle)*len);
            ctx.lineTo(0, 0);
            ctx.lineTo(-Math.cos(bangle)*len, Math.sin(bangle)*len);
            ctx.stroke();

            ctx.restore();
        }

    };

    //////////////////////////////////////////////
    function gameSetup() {
        game.birb = new Bird({
            p: new Vec2((X_TILES/2+0.5)*TILE, 7*TILE),
        });
        game.noobs.push(game.birb);

        // kd.SPACE.press(function() { launchFireball(); });
    }

    ///////////////////////////////////////////////
    function getTiles(abbrevs, key) {
        var l = abbrevs[key];
        if (!l) return [];
        return Array.isArray(l) ? l : [l];
    }

    function drawBg() {
        // Draw floor
        for (var x = -1; x < X_TILES + 1; x++) {
            const y = -1;

            ctx.drawImage(
                bg, 0, 0, BG_TILE, BG_TILE,
                x*TILE - game.bgOffset,
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

        game.noobs.forEach(function (noob) { noob.render(ctx); });

        // canvas.renderAll();
    }

    // function getKbdDirection() {
    //     if (kd.W.isDown() || kd.UP.isDown()) return 'up';
    //     if (kd.A.isDown() || kd.LEFT.isDown()) return 'left';
    //     if (kd.D.isDown() || kd.RIGHT.isDown()) return 'right';
    //     if (kd.S.isDown() || kd.DOWN.isDown()) return 'down';
    //     return null;
    // }

    function tick() {
        game.bgOffset = (game.bgOffset + SCROLL) % TILE;

        game.birb.setFlapping(kd.SPACE.isDown());

        game.noobs.forEach(function (noob) { noob.move(); });
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
        canvas.renderOnAddRemove = false;

        gameSetup();

        // audio.play();

        kd.run(function () { kd.tick(); });
        var stopRunning;
        kd.Q.press(function() {
            // audio.pause();
            stopRunning();
        });

        // kd.M.press(function() {
        //     game.audioOn = !game.audioOn;
        //     audio.volume = game.audioOn ? 1 : 0;
        // });

        $("loading").textContent = "";
        stopRunning = runAtFramerate(tick, draw, 30);
    }
    window.onload = init;


})();
