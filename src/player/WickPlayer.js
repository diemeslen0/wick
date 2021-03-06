/* Wick - (c) 2016 Zach Rispoli, Luca Damasco, and Josh Rispoli */

var WickPlayer = (function () {

    var wickPlayer = { };

    // Current project being played by player
    var project;

    // Ghost project used to restore original states of objects
    var initialStateProject;

    // Input vars for mouse and keyboard
    var mouse = {x:0, y:0};
    var keys = [];
    var lastKeyPressed;

    // Renderer
    var renderer;
    var audioPlayer;

    // Flags for different player modes (phone or desktop)
    var mobileMode;
    var desktopMode;

    // Set this to true to stop the next requestAnimationFrame
    var stopDrawLoop;

    // For keyboard input inside iframes
    var realWindow = window.parent || window;

    // Networking mode enabled flag
    var networkingEnabled = false;

    // Network PID assigned by server
    var pid;

/*****************************
    Player Setup
*****************************/

    wickPlayer.runProject = function(projectJSON) {

        // Initialize global Random var
        window.random = new Random();

        stopDrawLoop = false;

        // Check if we're on a mobile device or not
        mobileMode = BrowserDetectionUtils.inMobileMode;
        desktopMode = !mobileMode;

        // Load the project!
        project = loadJSONProject(projectJSON);
        project.fitScreen = !window.wickEditor;
        initialStateProject = loadJSONProject(projectJSON);
        initialStateProject.fitScreen = !window.wickEditor;

        if(window.wickEditor) {
            if(project.borderColor) document.getElementById('builtinPlayer').style.backgroundColor = project.borderColor;
        } else {
            if(project.borderColor) document.body.style.backgroundColor = project.borderColor;
        }

        // Patch old projects
        if(!project.audioPlayer) project.audioPlayer = "WickWebAudioPlayer";
        if(!project.renderer) project.renderer = "WickPixiRenderer";
        
        renderer = new window[project.renderer](project);
        audioPlayer = new window[project.audioPlayer](project);

        if(!mobileMode) {
            audioPlayer.setup();
        }
        renderer.setup();
        var playerCanvasContainer = renderer.getRendererElem();

        // Fix focus issues
        document.getElementById('rendererCanvas').className = ''
        setTimeout(function () {
            $('#rendererCanvas').focus();
        }, 100);
        $(document).on('focus', 'input[readonly]', function () {
            this.blur();
        });

        animate();

        // Setup mouse and key events (desktop mode)
        mouse = { x : 0, y : 0 };
        keys = [];
        if(desktopMode) {
            playerCanvasContainer.addEventListener('mousemove', onMouseMove, false);
            playerCanvasContainer.addEventListener("mousedown", onMouseDown, false);

            playerCanvasContainer.addEventListener("keydown", handleKeyDownInput);
            playerCanvasContainer.addEventListener("keyup", handleKeyUpInput);
        }

        // Setup touch events (mobile mode)
        if(mobileMode) {
            // Touch event (one touch = like a mouse click)
            playerCanvasContainer.addEventListener("touchstart", onTouchStart, false);

            // Squash gesture events
            playerCanvasContainer.addEventListener('gesturestart',  function(e) { e.preventDefault(); });
            playerCanvasContainer.addEventListener('gesturechange', function(e) { e.preventDefault(); });
            playerCanvasContainer.addEventListener('gestureend',    function(e) { e.preventDefault(); });
        }

        var preloader = new WickPreloader();

    }

    wickPlayer.stopRunningCurrentProject = function() {

        stopDrawLoop = true;

        rendererContainerEl.removeEventListener("mousedown", onMouseDown);
        rendererContainerEl.removeEventListener("touchstart", onTouchStart);

        playerCanvasContainer.removeEventListener("keydown", handleKeyDownInput);
        playerCanvasContainer.removeEventListener("keyup", handleKeyUpInput);

        audioPlayer.cleanup();
        renderer.cleanup();

    }

    wickPlayer.getMouse = function () {
        return mouse;
    }

    wickPlayer.getKeys = function () {
        return keys;
    }

    wickPlayer.getLastKeyPressed = function () {
        return lastKeyPressed;
    }

    wickPlayer.getProject = function () {
        return project;
    }

    wickPlayer.getAudioPlayer = function () {
        return audioPlayer;
    }

    wickPlayer.getRenderer = function () {
        return renderer;
    }

    wickPlayer.hideCursor = function () {
        document.getElementById('rendererCanvas').className = 'hideCursor'
    }

    wickPlayer.showCursor = function () {
        document.getElementById('rendererCanvas').className = ''
    }

    wickPlayer.cloneObject = function (wickObj) {
        var clone = wickObj.copy();
        clone.isClone = true;

        // pixi stuff
        //renderer.refreshPixiSceneForObject(clone);
        //wickObj.parentObject.pixiContainer.addChild(clone.pixiContainer || clone.pixiSprite || clone.pixiText)

        // player stuff
        resetAllPlayheads(clone);
        resetAllEventStates(clone);

        clone.parentObject = project.rootObject;
        project.addObject(clone);
        renderer.refreshPixiSceneForObject(clone);

        //project.addObject(clone);
        //clone.parentObject = project.rootObject;
        //wickObj.parentObject.addChild
        //project.regenerateUniqueIDs(project.rootObject);

        return clone;
    }

    wickPlayer.deleteObject = function (wickObj) {
        //project.currentObject.removeChildByID(wickObj.id);
        // So for now don't actually delete it, just make it go away somehow cos i'm lazy
        wickObj.deleted = true;
        // JUST GET IT OUTTA HERE I DONT CARE ................. 
        // it's like 8am pls forgive me for this
        wickObj.x = 80608060 + Math.random()*10000;
        wickObj.y = 80608060 + Math.random()*10000;
        wickObj.name = undefined;
    }

    wickPlayer.resetStateOfObject = function (wickObject) {

        // Clones go away because they have no original state! :O
        if(wickObject.isClone) {
            project.currentObject.removeChild(wickObject);
            return;
        }

        var initialStateObject = initialStateProject.getObjectByUUID(wickObject.uuid);
        if(!initialStateObject) return;

        // TOXXXIC
        //console.log("-------------");
        var blacklist = ['alphaMask', 'pixiSprite', 'pixiContainer', 'pixiText', 'imageData', 'audioData', 'wickScripts', 'parentObject', 'layers'];
        for (var name in wickObject) {
            if (name !== 'undefined' && wickObject.hasOwnProperty(name) && blacklist.indexOf(name) === -1) {
                if(initialStateObject[name] !== wickObject[name]) {
                    //console.log(name)
                    //console.log(wickObject[name] + " // " + initialStateObject[name])
                    wickObject[name] = initialStateObject[name];
                }
            }
        }
        
        wickObject.hoveredOver = false;
        wickObject.justEnteredFrame = true;
        wickObject.onNewFrame = true;
        wickObject.onLoadScriptRan = false;
        wickObject.playheadPosition = 0;
        wickObject.isPlaying = true;

        // Don't forget to reset the childrens states
        if(wickObject.isSymbol) {
            wickObject.getAllChildObjects().forEach(function (child) {
                wickPlayer.resetStateOfObject(child);
            });
        }

    }

    wickPlayer.enterFullscreen = function () {
        var elem;

        if(window.self !== window.top) {
            // Inside iframe
            elem = window.frameElement;
            console.log(elem)
        } else {
            // Not inside iframe
            elem = document.getElementById("rendererCanvas")
        }

        if (screenfull.enabled) {
            console.log("tryin to fullscreen");
            screenfull.request(elem);
        }
    }

    wickPlayer.setupNetworking = function (PID) {
        networkingEnabled = true;

        pid = PID;
        console.log("Connecting to server with PID " + pid);

        var socket = io();
        socket.emit('joinServer', pid);

        var validator = {
            set: function(obj, prop, value) {
                var allowed = ['x', 'y', 'rotation'];
                if(allowed.includes(prop)) {
                    //console.log(obj.uuid + ": " + prop + " set to " + value)
                    socket.emit('propUpdate', {
                        uuid: obj.uuid,
                        prop: prop,
                        val: value,
                    });
                }
                obj[prop] = value;
                return true;
            }
        };

        var allObjectsInProject = project.rootObject.getAllChildObjectsRecursive();
        allObjectsInProject.push(project.rootObject);
        allObjectsInProject.forEach(function (wickObj) {
            if(wickObj.pid !== pid) return;
            wickObj.setValidator(validator);
        });

        socket.on('propUpdateBroadcast', function(update){
            if (update.pid === pid) return;
            project.getObjectByUUID(update.uuid)[update.prop] = update.val;
        });
    }

/*****************************
    Opening projects
*****************************/

    var loadJSONProject = function (proj) {
        // Parse dat project
        var newProject = WickProject.fromJSON(proj);

        //newProject.rootObject = new Proxy(newProject.rootObject, validator);

        // Make sure we are always in the root (the player never 'goes inside' objects like the editor does.)
        newProject.currentObject = newProject.rootObject;
        newProject.rootObject.currentLayer = 0;

        // Prepare all objects for being played/drawn
        resetAllPlayheads(newProject.rootObject);
        resetAllEventStates(newProject.rootObject);

        // Regenerate WickObject stuff that we lost when the projects was JSONified
        newProject.rootObject.generateObjectNameReferences(newProject.rootObject);
        newProject.rootObject.generateParentObjectReferences(newProject.rootObject);

        return newProject;
    }

    /* Make sure all objects start at first frame and start playing */
    var resetAllPlayheads = function (wickObj) {

        // Set all playhead vars
        if(wickObj.isSymbol) {
            // Set this object to it's first frame
            wickObj.playheadPosition = 0;

            // Start the object playing
            wickObj.isPlaying = true;

            // Recursively set all playhead vars of children
            wickObj.getAllChildObjects().forEach(function(subObj) {
                resetAllPlayheads(subObj);
            });
        }
    }

    /* */
    var resetAllEventStates = function (wickObj) {

        // Reset the mouse hovered over state flag
        wickObj.hoveredOver = false;

        // All WickObjects are ready to play their sounds, run their onLoad scripts, etc.
        wickObj.justEnteredFrame = true;
        wickObj.onNewFrame = true;
        wickObj.onLoadScriptRan = false;

        // Do the same for all this object's children
        if(wickObj.isSymbol) {
            wickObj.getAllChildObjects().forEach(function(subObj) {
                resetAllEventStates(subObj);
            });
        }

    }

/*****************************
    Desktop event functions
*****************************/

    var onMouseMove = function (evt) {

        mouse = getMousePos(document.getElementById("rendererCanvas"), evt);

        // Check if we're hovered over a clickable object...
        var hoveredOverObj = false;
        project.rootObject.getAllActiveChildObjectsRecursive(true).forEach(function(child) {
            if(child.isClickable() && child.isPointInside(mouse)) {
                child.hoveredOver = true;
                hoveredOverObj = child;
            } else {
                child.hoveredOver = false;
            }
        });

        //...and change the cursor if we are
        if(hoveredOverObj) {
            rendererContainerEl.style.cursor = hoveredOverObj.cursor || "pointer";
        } else {
            rendererContainerEl.style.cursor = "default";
        }

    }

    var onMouseDown = function (evt) {
        
        project.rootObject.getAllActiveChildObjectsRecursive(true).forEach(function(child) {
            if(child.isClickable() && child.isPointInside(mouse)) {
                child.runScript(child.wickScripts["onClick"], 'onClick');
            }
        });

    }

    var handleKeyDownInput = function (event) {
        event.preventDefault();

        keys[event.keyCode] = true;
        lastKeyPressed = codeToKeyChar[event.keyCode];

        project.rootObject.getAllActiveChildObjectsRecursive(true).forEach(function(child) {
            child.runScript(child.wickScripts["onKeyDown"], 'onKeyDown');
        });
    }

    var handleKeyUpInput = function (event) {
        event.preventDefault();
        
        keys[event.keyCode] = false;
    }

/*****************************
    Mobile event functions
*****************************/

    var onTouchStart = function (evt) {

        evt.preventDefault();

        // on iOS, WebAudio context only gets 'unmuted' after first user interaction
        if(!audioContext) {
            audioPlayer.setup(project);
        }

        var touchPos = getTouchPos(document.getElementById("rendererCanvas"), evt);

        project.rootObject.getAllActiveChildObjects().forEach(function(child) {
            if(child.isPointInside(touchPos) && child.isClickable()) {
                child.runScript(child.wickScripts["onClick"], 'onClick');
            }
        });

    }

/*****************************
    Page/DOM Utils
*****************************/

    var getMousePos = function (canvas, evt) {
        var canvasBoundingClientRect = canvas.getBoundingClientRect();

        var mouseX = evt.clientX;
        var mouseY = evt.clientY;

        if(project.fitScreen) {
            mouseX -= canvasBoundingClientRect.left;
            mouseY -= canvasBoundingClientRect.top;
        }

        mouseX -= projectFitScreenTranslate.x;
        mouseY -= projectFitScreenTranslate.y;

        mouseX /=  projectFitScreenScale;
        mouseY /=  projectFitScreenScale;

        var centeredCanvasOffsetX = (window.innerWidth  - project.width) / 2;
        var centeredCanvasOffsetY = (window.innerHeight - project.height) / 2;

        if(!project.fitScreen) {
            mouseX -= centeredCanvasOffsetX;
            mouseY -= centeredCanvasOffsetY;
        }

        return {
            x: mouseX,
            y: mouseY
        };
    }

    var getTouchPos = function (canvas, evt) {
        var canvasBoundingClientRect = canvas.getBoundingClientRect();

        var touch = evt.targetTouches[0];

        var touchX = touch.pageX;
        var touchY = touch.pageY;

        if(project.fitScreen) {
            touchX -= canvasBoundingClientRect.left;
            touchY -= canvasBoundingClientRect.top;
        }

        touchX -= projectFitScreenTranslate.x;
        touchY -= projectFitScreenTranslate.y;

        touchX /=  projectFitScreenScale;
        touchY /=  projectFitScreenScale;

        var centeredCanvasOffsetX = (window.innerWidth - project.width) / 2;
        var centeredCanvasOffsetY = (window.innerHeight - project.height) / 2;

        if(!project.fitScreen) {
            touchX -= centeredCanvasOffsetX;
            touchY -= centeredCanvasOffsetY;
        }

        return {
            x: touchX,
            y: touchY
        };
    }

/*****************************
    Draw/update loop
*****************************/

    var animate = function () {

        if(project.framerate < 60) {
            setTimeout(function() {

                if(!stopDrawLoop) {
                    
                    project.rootObject.update();
                    project.rootObject.applyTweens();
                    renderer.render();
                    animate();
                    //requestAnimationFrame(animate);
                }
            }, 1000 / project.framerate);

        } else {

            if(!stopDrawLoop) {
                requestAnimationFrame(animate);
            }
            project.rootObject.update();
            project.rootObject.applyTweens();
            renderer.render();

        }

    }

    return wickPlayer;

})();