document.addEventListener('DOMContentLoaded', function () {
    const canvasWidth = Math.min(window.innerWidth * 0.8, 1700);
    const canvasHeight = Math.min(window.innerHeight * 0.8, 8000);

    // Initialize Fabric.js canvas
    const canvas = new fabric.Canvas('canvas', {
        width: canvasWidth,
        height: canvasHeight
    });

    // Custom control for the draggable arrow
    fabric.Object.prototype.controls.arrow = new fabric.Control({
        x: 1,
        y: 0.5,
        offsetX: 15,
        offsetY: 0,
        sizeX: 20,
        sizeY: 20,
        actionHandler: function (eventData, transform, x, y) {
            const target = transform.target;
            target.set({ top: transform.pointerY });
            canvas.requestRenderAll();
            return true;
        },
        cursorStyle: 'grabbing',
        mouseDownHandler: function (eventData, target) {
            target.canvas.isDragging = true;
        },
        mouseUpHandler: function (eventData, target) {
            target.canvas.isDragging = false;
        },
        render: function (ctx, left, top) {
            ctx.beginPath();
            ctx.moveTo(left, top + this.sizeY);
            ctx.lineTo(left + this.sizeX / 2, top);
            ctx.lineTo(left + this.sizeX, top + this.sizeY);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.fill();
        },
    });

    // Add draggable line
    function addLine(y) {
        const line = new fabric.Line([0, y, canvas.width, y], {
            stroke: 'red',
            strokeWidth: 2,
            selectable: true,
            hasControls: true,
            hasBorders: false,
            lockMovementX: true,
            lockScalingX: true,
            lockScalingY: true,
            lockUniScaling: true,
            lockRotation: true,
        });
        line.setControlVisible('mtr', false);
        line.setControlVisible('mt', false);
        line.setControlVisible('mr', false);
        line.setControlVisible('mb', false);
        line.setControlVisible('ml', false);
        line.setControlVisible('tl', false);
        line.setControlVisible('tr', false);
        line.setControlVisible('bl', false);
        line.setControlVisible('br', false);
        canvas.add(line);
    }

    // Create slicing lines based on the selected number of slices
    function createSlicingLines() {
        const numSlices = parseInt(document.getElementById('num-slices').value);
        const sliceHeight = canvas.height / numSlices;
        canvas.remove(...canvas.getObjects('line'));
        for (let i = 1; i < numSlices; i++) {
            addLine(sliceHeight * i);
        }
    }

    // Update slicing lines when the number of slices changes
    document.getElementById('num-slices').addEventListener('change', function () {
        createSlicingLines();
    });

    // Handle image upload
    const imageUpload = document.getElementById('image-upload');
    imageUpload.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                fabric.Image.fromURL(event.target.result, function (img) {
                    const scaleFactor = Math.min(canvasWidth / img.width, canvasHeight / img.height);
                    img.scale(scaleFactor);
                    img.set({ left: (canvas.width - img.width * scaleFactor) / 2, top: (canvas.height - img.height * scaleFactor) / 2 });
                    canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                        scaleX: scaleFactor,
                        scaleY: scaleFactor,
                        originX: 'left',
                        originY: 'top',
                    });
                    createSlicingLines();
                });
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle upload button click
    document.getElementById('upload-button').addEventListener('click', function () {
        imageUpload.click();
    });

    async function compressImage(blob, targetSize) {
        const originalImage = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);

        let quality = 1.0;
        let compressedBlob;
        const minQuality = 0.7; // Set a minimum quality threshold
        const qualityStep = 0.02; // Smaller reduction step for better control

        do {
            compressedBlob = await new Promise((resolve) => {
                canvas.toBlob(
                    (result) => {
                        resolve(result);
                    },
                    'image/jpeg',
                    quality
                );
            });

            quality -= qualityStep;
        } while (compressedBlob.size > targetSize && quality > minQuality);

        return compressedBlob;
    }
    // Export sliced images as a zip file
    document.getElementById('export-button').addEventListener('click', async function () {
        const numSlices = parseInt(document.getElementById('num-slices').value);
        const lines = canvas.getObjects('line').sort((a, b) => a.top - b.top);
        const backgroundImage = canvas.backgroundImage;
        const zip = new JSZip();

        // Create a folder for the sliced images
        const folder = zip.folder('sliced-images');

        // Save the slices as image files
        const promises = [];
        for (let i = 0; i < numSlices; i++) {
            const startY = i === 0 ? 0 : lines[i - 1].top / backgroundImage.scaleY;
            const endY = i === numSlices - 1 ? backgroundImage.height : lines[i].top / backgroundImage.scaleY;
            const sliceHeight = endY - startY;
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = backgroundImage.width;
            croppedCanvas.height = sliceHeight;
            const croppedCtx = croppedCanvas.getContext('2d');
            croppedCtx.drawImage(
                backgroundImage.getElement(),
                0,
                startY,
                backgroundImage.width,
                sliceHeight,
                0,
                0,
                backgroundImage.width,
                sliceHeight
            );

            promises.push(
                new Promise(async (resolve) => {
                    croppedCanvas.toBlob(async (blob) => {
                        let filename = `slice-${i + 1}.png`;

                        if (blob.size > 400 * 1024) {
                            blob = await compressImage(blob, 400 * 1024);
                            filename = `slice-${i + 1}.jpg`;
                        }
                        folder.file(filename, blob);
                        resolve();
                    }, 'image/png');
                })
            );
        }

        // Generate the zip file and save it
        Promise.all(promises).then(() => {
            zip.generateAsync({ type: 'blob' }).then((content) => {
                saveAs(content, 'sliced-images.zip');
            });
        });
    });
});
