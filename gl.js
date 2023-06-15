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

const vsSource = `
    attribute vec4 a_vertexPosition;
    uniform mat4 u_modelViewMatrix;
    uniform mat4 u_projectionMatrix;

    varying highp vec2 v_textureCoord;

    void main() {
      v_textureCoord = a_vertexPosition.xy;
      gl_Position = u_projectionMatrix * u_modelViewMatrix * a_vertexPosition;
    }
`;

const fsSource = `
    precision highp float;

    varying highp vec2 v_textureCoord;
    uniform sampler2D u_sampler;
    uniform vec4 u_color;
    uniform float u_alpha;
    uniform float u_freezeEffect;
    uniform float u_useTex;  // ???

    void main() {
      vec4 textureColor = texture2D(u_sampler, v_textureCoord);
      gl_FragColor = u_color;
      if (u_useTex != 0.0) {
        gl_FragColor = vec4(textureColor.rgb, u_alpha*textureColor.a);
      };

      if (u_freezeEffect > 0.0 && textureColor.g > 0.8) {
        gl_FragColor = mix(
            gl_FragColor, vec4(165.0/255.,197./255.,217./255., 1.0), u_freezeEffect);
        }
    }
`;

class CustomCanvas {
    constructor(gl, sizes) {
        this.gl = gl;
        this.projectionMatrix = mat4.create();

        this.viewMatrix = mat4.create();
        this.stack = [];

        this.programInfo = initShaderProgram(gl, vsSource, fsSource);

        const squarePositions = [1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0];
        this.squareBuffer = makeBuffer(gl, squarePositions, gl.STATIC_DRAW);

        gl.useProgram(this.programInfo.program);
        this.setProjection(sizes.width, sizes.height);
        this.globalAlpha = 1.0;
        this.freezeEffect = 0.0

        this.path = [];

        this.strokeStyle = "#ffffff";
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
        mat4.scale(this.viewMatrix, this.viewMatrix, scalev);
    }

    rotate(theta) {
        mat4.rotateZ(this.viewMatrix, this.viewMatrix, theta);
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
            this.programInfo.uniforms.modelViewMatrix,
            false,
            this.viewMatrix,
        );
    };

    translate(dx, dy) {
        const dv = vec3.create();
        vec3.set(dv, dx, dy, 0);
        mat4.translate(this.viewMatrix, this.viewMatrix, dv);
    }

    save() {
        this.stack.push({
            view: this.viewMatrix, alpha: this.globalAlpha, freeze: this.freezeEffect,
            strokeStyle: this.strokeStyle,
        });

        let n = mat4.create();
        mat4.copy(n, this.viewMatrix);
        this.viewMatrix = n;
    }

    restore() {
        let res = this.stack.pop();
        this.viewMatrix = res.view;
        this.globalAlpha = res.alpha;
        this.freezeEffect = res.freeze;
        this.strokeStyle = res.strokeStyle;
    }

    moveTo(x, y) {
        this.path.push([x, y]);
    }
    lineTo(x, y) {
        const last = this.path[this.path.length - 1];
        last.push(x);
        last.push(y);
    }

    beginPath() {
        this.path = [];
    }

    ellipse() {}
    fill() {}

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
            for (let i = 0; i + 2 < spath.length; i += 2) {
                vpath.push(spath[i + 0]);
                vpath.push(spath[i + 1]);
                vpath.push(spath[i + 2]);
                vpath.push(spath[i + 3]);
            }
        });
        // this.path = [];
        const gl = this.gl;
        const buf = makeBuffer(gl, vpath);
        gl.lineWidth(2);

        this._setUniforms();

        gl.uniform1f(this.programInfo.uniforms.useTex, 0.0);
        gl.uniform4fv(this.programInfo.uniforms.color, parseColor(this.strokeStyle));

        {
            const offset = 0;
            const vertexCount = vpath.length / 2;
            setPositionAttribute(
                gl, buf, this.programInfo.attribs.vertexPosition);
            gl.drawArrays(gl.LINES, offset, vertexCount);
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
        alpha: false,
        premultipliedAlpha: false
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
