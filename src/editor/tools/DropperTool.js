/* Wick - (c) 2016 Zach Rispoli, Luca Damasco, and Josh Rispoli */

var DropperTool = function (wickEditor) {

    var that = this;

    this.getCursorImage = function () {
        return 'url("resources/dropper.png") 2 14,default';
    }

    wickEditor.fabric.canvas.on('mouse:down', function (e) {
        if(wickEditor.fabric.currentTool instanceof DropperTool) {
            
            var image = new Image();
            image.onload = function () {
                var mouse = wickEditor.inputHandler.mouse;
                var color = GetColorAtCoords(image, mouse.x*window.devicePixelRatio, mouse.y*window.devicePixelRatio, "hex");
                wickEditor.fabric.tools.paintbrush.color = color;
                wickEditor.syncInterfaces();
            };
            image.src = wickEditor.fabric.canvas.toDataURL();
            
            wickEditor.syncInterfaces();
        }
    });

}