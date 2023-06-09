// used a bunch from https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/

export let parseColor = (() => {
    // This is super cheesy. Parse colors by writing the color to a canvas and
    // reading it back.
    const canvas = document.createElement('canvas');
    canvas.height = canvas.width = 1;
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    const cache = {};

    function parse(s) {
        if (cache[s]) {
            return cache[s];
        }

        ctx.fillStyle = s;
        ctx.rect(0, 0, 1, 1);
        ctx.fill();

        let res = ctx.getImageData(0, 0, 1, 1).data;
        cache[s] = res;
        return res;
    }

    return parse;
})();

export function parseColorFloat(s) {
    let color = parseColor(s);
    return [color[0]/255, color[1]/255, color[2]/255, color[3]/255]
}

////////////////////////
//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(
            `An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`
        );
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(
            `Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`
        );
        return null;
    }

    const nun = gl.getProgramParameter(shaderProgram, gl.ACTIVE_UNIFORMS);
    let uniforms = {}
    for (let i = 0; i < nun; i++) {
        let uniform = gl.getActiveUniform(shaderProgram, i);
        uniforms[uniform.name.substring(2)] = gl.getUniformLocation(
            shaderProgram, uniform.name);
    }

    const natt =  gl.getProgramParameter(shaderProgram, gl.ACTIVE_ATTRIBUTES);
    let attribs = {}
    for (let i = 0; i < natt; i++) {
        let attrib = gl.getActiveAttrib(shaderProgram, i);
        attrib[attrib.name.substring(2)] = gl.getAttribLocation(
            shaderProgram, attrib.name);
    }

    return { program: shaderProgram, uniforms: uniforms, attribs: attribs };
}


//////////////
// test code

function makeBuffer(gl, data, mode) {
    mode = mode === undefined ? gl.STREAM_DRAW : gl.STATIC_DRAW;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), mode);
    return buffer;
}


function setPositionAttribute(gl, buffer, attribute) {
    const numComponents = 2; // pull out 2 values per iteration
    const type = gl.FLOAT; // the data in the buffer is 32bit floats
    const normalize = false; // don't normalize
    const stride = 0; // how many bytes to get from one set of values to the next
    // 0 = use type and numComponents above
    const offset = 0; // how many bytes inside the buffer to start from
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(
        attribute,
        numComponents,
        type,
        normalize,
        stride,
        offset
    );
    gl.enableVertexAttribArray(attribute);
}

//
// Initialize a texture and load an image.
// When the image finished loading copy it into the texture.
//
function loadTexture(gl, image) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Because images have to be downloaded over the internet
    // they might take a moment until they are ready.
    // Until then put a single pixel in the texture so we can
    // use it immediately. When the image has finished downloading
    // we'll update the texture with the contents of the image.
    const level = 0;
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        level,
        internalFormat,
        srcFormat,
        srcType,
        image
    );

    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    return texture;
}

////////////////////////

const vsSource = `#version 300 es
    in vec4 a_vertexPosition;
    uniform mat4 u_worldMatrix;
    uniform mat4 u_projectionMatrix;

    out highp vec2 v_textureCoord;

    void main() {
      v_textureCoord = a_vertexPosition.xy;
      gl_Position = u_projectionMatrix * u_worldMatrix * a_vertexPosition;
    }
`;

const fsSource = `#version 300 es
    precision highp float;

    in highp vec2 v_textureCoord;
    uniform sampler2D u_sampler;
    uniform vec4 u_color;
    uniform float u_alpha;
    uniform float u_freezeEffect;
    uniform float u_useTex;  // ???
    uniform float u_circleClip;  // ???

    out vec4 outputColor;

    void main() {
      if (u_circleClip == 1.0) {
          if (distance(v_textureCoord, vec2(0.5, 0.5)) > 0.5) {
              discard;
          }
      }

      outputColor = u_color;

      vec4 textureColor = texture(u_sampler, v_textureCoord);
      if (u_useTex != 0.0) {
          outputColor *= textureColor;
      };

      if (u_freezeEffect > 0.0 && textureColor.g > 0.8) {
          outputColor = mix(
              outputColor,
              vec4(165.0/255.,197./255.,217./255., 1.0),
              u_freezeEffect
          );
      }

      outputColor.a *= u_alpha;
    }
`;

class CustomCanvas {
    constructor(gl, sizes) {
        this.gl = gl;
        this.projectionMatrix = mat4.create();

        this.idMatrix = mat4.create();
        this.worldMatrix = mat4.create();
        this.stack = [];

        this.programInfo = initShaderProgram(gl, vsSource, fsSource);

        const squarePositions = [1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0];
        this.squareBuffer = makeBuffer(gl, squarePositions, gl.STATIC_DRAW);

        gl.useProgram(this.programInfo.program);
        this.setProjection(sizes.width, sizes.height);
        this.globalAlpha = 1.0;
        this.freezeEffect = 0.0
        this.lineWidth = 1;
        this.strokeStyle = "#000000";
        this.fillStyle = "#000000";

        this.dpr = 1;
        this.path = [];
    }

    setProjection(width, height) {
        mat4.ortho(this.projectionMatrix, 0, width, 0, height, -1, 1);
        this.gl.uniformMatrix4fv(
            this.programInfo.uniforms.projectionMatrix,
            false,
            this.projectionMatrix
        );
    }

    scale(x, y) {
        const scalev = vec3.create();
        vec3.set(scalev, x, y, 1);
        mat4.scale(this.worldMatrix, this.worldMatrix, scalev);
    }

    rotate(theta) {
        mat4.rotateZ(this.worldMatrix, this.worldMatrix, theta);
    }

    _setUniforms() {
        const gl = this.gl;
        gl.uniform1f(
            this.programInfo.uniforms.alpha,
            this.globalAlpha,
        );
        gl.uniform1f(
            this.programInfo.uniforms.freezeEffect,
            this.freezeEffect,
        );
        gl.uniformMatrix4fv(
            this.programInfo.uniforms.worldMatrix,
            false,
            this.worldMatrix,
        );
    };

    translate(dx, dy) {
        const dv = vec3.create();
        vec3.set(dv, dx, dy, 0);
        mat4.translate(this.worldMatrix, this.worldMatrix, dv);
    }

    save() {
        this.stack.push({
            world: this.worldMatrix, alpha: this.globalAlpha, freeze: this.freezeEffect,
            strokeStyle: this.strokeStyle, fillStyle: this.fillStyle,
            lineWidth: this.lineWidth,
        });

        let n = mat4.create();
        mat4.copy(n, this.worldMatrix);
        this.worldMatrix = n;
    }

    restore() {
        let res = this.stack.pop();
        this.worldMatrix = res.world;
        this.globalAlpha = res.alpha;
        this.freezeEffect = res.freeze;
        this.strokeStyle = res.strokeStyle;
        this.fillStyle = res.fillStyle;
        this.lineWidth = res.lineWidth;
    }

    _transformedPoint(x, y) {
        let v = vec3.create();
        vec3.set(v, x, y, 0);
        vec3.transformMat4(v, v, this.worldMatrix);
        return v;
    }

    moveTo(x, y) {
        this.path.push([this._transformedPoint(x, y)]);
    }
    lineTo(x, y) {
        const last = this.path[this.path.length - 1];
        last.push(this._transformedPoint(x, y));
    }

    beginPath() {
        this.path = [];
    }

    ellipse() {
        this.curEllipse = arguments;
    }

    _fillEllipse() {
        const gl = this.gl;

        let [x, y, radiusX, radiusY, rotation, startAngle, endAngle] =
            this.curEllipse;

        if (!(startAngle == 0 && endAngle == 2*Math.PI)) {
            throw new Error("can't actually do complex ellipses");
        }

        this.save();
        this.translate(x, y);
        this.rotate(rotation);
        this.scale(2*radiusX, 2*radiusY);
        this.translate(-0.5, -0.5);

        this._setUniforms();

        let color = parseColorFloat(this.fillStyle);
        gl.uniform1f(this.programInfo.uniforms.useTex, 0.0);
        gl.uniform1f(this.programInfo.uniforms.circleClip, 1.0);
        gl.uniform4fv(this.programInfo.uniforms.color, color);

        {
            const offset = 0;
            const vertexCount = 4;
            setPositionAttribute(
                gl, this.squareBuffer, this.programInfo.attribs.vertexPosition);
            gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
        }

        gl.uniform1f(this.programInfo.uniforms.circleClip, 0.0);
        this.restore();

        this.curEllipse = null;

    }

    fill(rule) {
        if (this.curEllipse) {
            return this._fillEllipse(rule);
        }

        rule = rule ?? "nonzero";

        // Apparently TRIANGLE_FAN is slow on windows, so just do it.
        let vpath = []
        for (const spath of this.path) {
            for (let i = 1; i + 1 < spath.length; i++) {
                vpath.push(spath[    0][0]);
                vpath.push(spath[    0][1]);
                vpath.push(spath[i + 0][0]);
                vpath.push(spath[i + 0][1]);
                vpath.push(spath[i + 1][0]);
                vpath.push(spath[i + 1][1]);
            }
        }
        const gl = this.gl;
        const buf = makeBuffer(gl, vpath);

        this._setUniforms();
        gl.uniform1f(this.programInfo.uniforms.useTex, 0.0);
        gl.uniform4fv(
            this.programInfo.uniforms.color,
            parseColorFloat(this.fillStyle));
        gl.uniformMatrix4fv(
            this.programInfo.uniforms.worldMatrix,
            false,
            this.idMatrix,
        );

        // Draw it with the stencil on
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.NEVER, 0, 0xff);
        if (rule == "evenodd") {
            gl.stencilOp(gl.INVERT, gl.INVERT, gl.INVERT);
        } else {
            gl.stencilOpSeparate(
                gl.FRONT, gl.INCR_WRAP, gl.INCR_WRAP, gl.INCR_WRAP);
            gl.stencilOpSeparate(
                gl.BACK, gl.DECR_WRAP, gl.DECR_WRAP, gl.DECR_WRAP);
        }

        const offset = 0;
        const vertexCount = vpath.length / 2;
        setPositionAttribute(
            gl, buf, this.programInfo.attribs.vertexPosition);
        gl.drawArrays(gl.TRIANGLES, offset, vertexCount);

        // Redraw everything, with a stencil test
        // Would it be better to draw a new shape covering everything
        // without overlaps? Probably depends.
        gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
        gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
        gl.drawArrays(gl.TRIANGLES, offset, vertexCount);

        gl.disable(gl.STENCIL_TEST);
    }

    rect(x, y, w, h) {
        this.moveTo(x  , y);
        this.lineTo(x  , y+h);
        this.lineTo(x+w, y+h);
        this.lineTo(x+w, y);
        this.lineTo(x  , y);
    }

    stroke() {
        let vpath = []
        this.path.forEach((spath) => {
            for (let i = 0; i + 1 < spath.length; i++) {
                vpath.push(spath[i + 0][0]);
                vpath.push(spath[i + 0][1]);
                vpath.push(spath[i + 1][0]);
                vpath.push(spath[i + 1][1]);
            }
        });
        // this.path = [];
        const gl = this.gl;
        const buf = makeBuffer(gl, vpath);
        // XXX: This doesn't really work in general (we should draw
        // filled quads) but it works on my dev machine for up to 4, which
        // is all *I* needed for now...
        gl.lineWidth(this.dpr * this.lineWidth);

        this._setUniforms();

        gl.uniform1f(this.programInfo.uniforms.useTex, 0.0);
        gl.uniform4fv(
            this.programInfo.uniforms.color,
            parseColorFloat(this.strokeStyle));
        gl.uniformMatrix4fv(
            this.programInfo.uniforms.worldMatrix,
            false,
            this.idMatrix,
        );

        {
            const offset = 0;
            const vertexCount = vpath.length / 2;
            setPositionAttribute(
                gl, buf, this.programInfo.attribs.vertexPosition);
            gl.drawArrays(gl.LINES, offset, vertexCount);
        }
    }

    drawTriangle(x0, y0, x1, y1, x2, y2) {
        const gl = this.gl;

        let vpath = [x0, y0, x1, y1, x2, y2];
        const buf = makeBuffer(gl, vpath);

        this._setUniforms();
        gl.uniform1f(this.programInfo.uniforms.useTex, 0.0);
        gl.uniform4fv(
            this.programInfo.uniforms.color,
            parseColorFloat(this.fillStyle));

        {
            const offset = 0;
            const vertexCount = 3;
            setPositionAttribute(
                gl, buf, this.programInfo.attribs.vertexPosition);
            gl.drawArrays(gl.TRIANGLES, offset, vertexCount);
        }
    }

    drawImage(img, dx, dy, width, height) {
        const gl = this.gl;
        if (img.texture === undefined) {  // lol
            img.texture = loadTexture(gl, img);
        }

        this.save();
        this.translate(dx, dy);
        this.scale(width, height);

        this._setUniforms();

        const unit = 0
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, img.texture);
        gl.uniform1i(this.programInfo.uniforms.sampler, unit);
        gl.uniform1f(this.programInfo.uniforms.useTex, 1.0);
        gl.uniform4fv(this.programInfo.uniforms.color, parseColorFloat("#ffffff"));

        {
            const offset = 0;
            const vertexCount = 4;
            setPositionAttribute(
                gl, this.squareBuffer, this.programInfo.attribs.vertexPosition);
            gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
        }

        this.restore();
    }

    clear(scolor) {
        let color = parseColor(scolor);
        this.gl.clearColor(color[0]/255, color[1]/255, color[2]/255, color[3]/255);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
}



export function setupGL(canvas, sizes) {
    const gl = canvas.getContext("webgl2",{
        // HMMMMM
        // premultipliedAlpha: false,
        stencil: true,
    });
    if (gl === null) {
        alert(
            "Unable to initialize WebGL. Your browser or machine may not support it."
        );
    }

    let ctx = new CustomCanvas(gl, sizes);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // sigh

    ///
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    return ctx;
}

//////
function makeCanvasProxy(ctx, sizes) {
    const ops = {
        drawImage: (img, dx, dy, width, height) => {
            ctx.save();
            ctx.translate(dx, dy+height/2);
            ctx.scale(1, -1);
            ctx.drawImage(img, 0, -height/2, width, height);
            ctx.restore();
        },
        clear: (color) => {
            ctx.save();
            ctx.fillStyle = color;
            ctx.rect(0, 0, sizes.width, sizes.height);
            ctx.fill();
            ctx.restore();
        },
        setProjection(width, height) {
            ctx.scale(1, -1);
            ctx.translate(0, -height);
        },
        drawTriangle(x0, y0, x1, y1, x2, y2) {
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.fill();
        }
    };

    const flippedProxy = {
        get(target, prop, receiver) {
            if (ops[prop]) return ops[prop];
            const res = target[prop];
            if (res instanceof Function) {
                return (...args) => {
                    return Reflect.apply(res, ctx, args);
                };
            } else {
                return res;
            }
        },
        set(obj, prop, value) {
            if (obj[prop] !== undefined) {
                return Reflect.set(obj, prop, value);
            }
            return true;
        }
    };
    const p = new Proxy(ctx, flippedProxy);
    p.setProjection(sizes.width, sizes.height);
    return p;
}

export function setupFlippedCanvas(canvas, sizes) {
    const ctx = canvas.getContext("2d");
    return makeCanvasProxy(ctx, sizes);
}
