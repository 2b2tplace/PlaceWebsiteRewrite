function setup() {
	createCanvas(windowWidth, windowHeight, WEBGL);
	camera.on();
	camera.x = 0;
	camera.y = 0;
	frameRate(120);
    noSmooth();
}

function draw() {
	background('black');

    fill('white');
    rect(mouseX, mouseY, mouseX + 5, mouseY + 5);
}