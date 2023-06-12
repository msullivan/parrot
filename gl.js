// used a bunch from https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/

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

    return shaderProgram;
}


//////////////
// test code

function initBuffers(gl) {
    const positionBuffer = initPositionBuffer(gl);

    return {
        position: positionBuffer,
    };
}

function initPositionBuffer(gl) {
    // Create a buffer for the square's positions.
    const positionBuffer = gl.createBuffer();

    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Now create an array of positions for the square.
    const positions = [1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0];

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return positionBuffer;
}


// Tell WebGL how to pull out the positions from the position
// buffer into the vertexPosition attribute.
function setPositionAttribute(gl, buffers, programInfo) {
    const numComponents = 2; // pull out 2 values per iteration
    const type = gl.FLOAT; // the data in the buffer is 32bit floats
    const normalize = false; // don't normalize
    const stride = 0; // how many bytes to get from one set of values to the next
    // 0 = use type and numComponents above
    const offset = 0; // how many bytes inside the buffer to start from
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset
    );
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
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
    uniform float u_alpha;
    uniform float u_freezeEffect;

    void main() {
      vec4 textureColor = texture2D(u_sampler, v_textureCoord);
      gl_FragColor = vec4(textureColor.rgb, u_alpha*textureColor.a);

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

        ///

        let shaderProgram = initShaderProgram(gl, vsSource, fsSource);
        this.programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: gl.getAttribLocation(shaderProgram, "a_vertexPosition"),
            },
            uniforms: {
                projectionMatrix: gl.getUniformLocation(shaderProgram, "u_projectionMatrix"),
                modelViewMatrix: gl.getUniformLocation(shaderProgram, "u_modelViewMatrix"),
                sampler: gl.getUniformLocation(shaderProgram, "u_sampler"),
                alpha: gl.getUniformLocation(shaderProgram, "u_alpha"),
                freezeEffect: gl.getUniformLocation(shaderProgram, "u_freezeEffect"),
            },
        };

        this.buffers = initBuffers(gl);

        setPositionAttribute(gl, this.buffers, this.programInfo);
        gl.useProgram(this.programInfo.program);
        this.setProjection(sizes.width, sizes.height);
        this.globalAlpha = 1.0;
        this.freezeEffect = 0.0
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
            view: this.viewMatrix, alpha: this.globalAlpha, freeze: this.freezeEffect});

        let n = mat4.create();
        mat4.copy(n, this.viewMatrix);
        this.viewMatrix = n;
    }

    restore() {
        let res = this.stack.pop();
        this.viewMatrix = res.view;
        this.globalAlpha = res.alpha;
        this.freezeEffect = res.freeze;
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

        {
            const offset = 0;
            const vertexCount = 4;
            gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
        }

        this.restore();
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
    gl.clearColor(0x87/255, 0xce/255, 0xeb/255, 1.0); // XXX
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return ctx;
}
