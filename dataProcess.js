
async function initializeScene() {
    // Create the engine and the scene
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);

    // Create a UniversalCamera
    var camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(-60, 10, 45), scene);
    camera.setTarget(new BABYLON.Vector3(0, 0, 45));
    camera.attachControl(canvas, true);

    // Add a floor to the scene
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
    const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1); // White color
    ground.material = groundMaterial;
    ground.position = new BABYLON.Vector3(0, 3, 45); // Slightly below the visualization
    

    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 10, 0), scene);

    // Set up WebXR experience
    const xrHelper = await scene.createDefaultXRExperienceAsync({
        floorMeshes: [ground]
    });

    // Variables for scaling and interaction
    let leftController, rightController;
    let initialDistance = null;
    let initialScale = null;
    let isScaling = false;
    let pickedMesh = null;
    let originalParent = null;

    const groupMeshes = {};

    document.getElementById("csvFileInput").addEventListener("change", async function(event) {
        df = await dfd.readCSV(event.target.files[0]);
        document.getElementById("csvFileInput").style.display = 'none';
        canvas.style.display = 'block';
        const wormName = "Group";
        const TimeAttribute = "Time";
        const Groups = df[wormName].unique().values;
        const Attribute1 = "Daphnia_Large";
        const Attribute2 = "Daphnia_Small";

        let allBoxPlotValues = [];

        for (let Group of Groups) {
            let filteredDf = df.loc({ rows: df[wormName].eq(Group), columns: [TimeAttribute, Attribute1, Attribute2] });
            let groupedDf = filteredDf.groupby([TimeAttribute]);
            let Attrnames = [Attribute1, Attribute2];
            let intermediate = {};
            let [min, Q1, median, Q3, IQR, max] = [[], [], [], [], [], []];
            let boxPLotvalues = [];

            for (let timeStamp of filteredDf[TimeAttribute].unique().values) {
                Attrnames.forEach((Attrname, i) => intermediate[i] = groupedDf.getGroup([timeStamp])[Attrname].values);
                for (let i = 0; i < 2; i++) {
                    Q1[i] = math.quantileSeq(intermediate[i], 0.25);
                    median[i] = math.quantileSeq(intermediate[i], 0.5);
                    Q3[i] = math.quantileSeq(intermediate[i], 0.75);
                    IQR = Q3[i] - Q1[i];
                    min[i] = math.min(intermediate[i].filter(value => value >= (Q1[i] - 1.5 * IQR)));
                    max[i] = math.max(intermediate[i].filter(value => value <= (Q3[i] + 1.5 * IQR)));
                }

                boxPLotvalues.push([
                    new BABYLON.Vector3(median[0], Q1[1], timeStamp),
                    new BABYLON.Vector3(Q1[0], median[1], timeStamp),
                    new BABYLON.Vector3(median[0], Q3[1], timeStamp),
                    new BABYLON.Vector3(Q3[0], median[1], timeStamp),
                    new BABYLON.Vector3(median[0], min[1], timeStamp),
                    new BABYLON.Vector3(min[0], median[1], timeStamp),
                    new BABYLON.Vector3(median[0], max[1], timeStamp),
                    new BABYLON.Vector3(max[0], median[1], timeStamp)
                ]);
            }

            allBoxPlotValues.push({ group: Group, values: boxPLotvalues });
        }

        function connectPoints(points, scene, color, group) {
            let diamondLines = [];
            let whiskerLines = [];
            for (let i = 0; i < points.length; i++) {
                let diamond = [
                    points[i][0], points[i][1],
                    points[i][1], points[i][2],
                    points[i][2], points[i][3],
                    points[i][3], points[i][0]
                ];
                diamondLines.push(diamond);
                whiskerLines.push(
                    [points[i][0], points[i][4]], // Left whisker
                    [points[i][1], points[i][5]], // Right whisker
                    [points[i][2], points[i][6]], // Bottom whisker
                    [points[i][3], points[i][7]]  // Top whisker
                );
            }

            let allLines = [...diamondLines, ...whiskerLines];
            let LineSystem = BABYLON.MeshBuilder.CreateLineSystem(`lines_${group}`, { lines: allLines }, scene);
            LineSystem.color = color;

            var paths = diamondLines.map(line => line.flat());
            var ribbon = BABYLON.Mesh.CreateRibbon(`ribbon_${group}`, paths, false, false, 0, scene);
            const ribbonMaterial = new BABYLON.StandardMaterial(`ribbonMaterial_${group}`, scene);
            ribbonMaterial.diffuseColor = color;
            ribbonMaterial.backFaceCulling = false;
            ribbon.material = ribbonMaterial;

            // Create a parent TransformNode
            const parentNode = new BABYLON.TransformNode(`parent_${group}`, scene);
            LineSystem.parent = parentNode;
            ribbon.parent = parentNode;

            groupMeshes[group] = { parentNode, LineSystem, ribbon };
        }

        // const colors = {
        //     "Control": new BABYLON.Color3(1, 0, 0), // Red
        //     "High Dose": new BABYLON.Color3(0, 1, 0), // Green
        //     "Low Dose": new BABYLON.Color3(0, 0, 1) // Blue
        // };




        // Function to generate a random color
        function getRandomColor() {
            return new BABYLON.Color3(
                Math.random(),
                Math.random(),
                Math.random()
            );
        }

        // Create a color map for all groups
        const colors = {};
        Groups.forEach(group => {
            colors[group] = getRandomColor();
        });





        allBoxPlotValues.forEach(groupData => {
            connectPoints(groupData.values, scene, colors[groupData.group], groupData.group);
        });

        function toggleVisibility(group) {
            const meshes = groupMeshes[group];
            if (meshes) {
                meshes.LineSystem.isVisible = !meshes.LineSystem.isVisible;
                meshes.ribbon.isVisible = !meshes.ribbon.isVisible;
            }
        }

        // window.addEventListener("keydown", function(event) {
        //     if (event.key === "1") {
        //         toggleVisibility("Control");
        //     } else if (event.key === "2") {
        //         toggleVisibility("Low Dose");
        //     } else if (event.key === "3") {
        //         toggleVisibility("High Dose");
        //     }
        // });
        
        
        const maxGroups = Math.min(Groups.length, 10);

        window.addEventListener("keydown", function(event) {
            const keyNumber = parseInt(event.key);
            if (!isNaN(keyNumber) && keyNumber >= 0 && keyNumber < maxGroups) {
                const groupToToggle = Groups[keyNumber];
                toggleVisibility(groupToToggle);
            }
        });

        xrHelper.input.onControllerAddedObservable.add((controller) => {
            controller.onMotionControllerInitObservable.add((motionController) => {
                const xr_ids = motionController.getComponentIds();
                let triggerComponent = motionController.getComponent(xr_ids[0]); // xr-standard-trigger
                let squeezeComponent = motionController.getComponent(xr_ids[1]); // xr-standard-squeeze

                if (motionController.handness === 'left') {
                    leftController = controller;
                } else if (motionController.handness === 'right') {
                    rightController = controller;
                }

                triggerComponent.onButtonStateChangedObservable.add(() => {
                    if (triggerComponent.changes.pressed) {
                        if (triggerComponent.pressed) {
                            if (motionController.handness === 'left') {
                                let mesh = scene.meshUnderPointer;
                                if (xrHelper.pointerSelection.getMeshUnderPointer) {
                                    mesh = xrHelper.pointerSelection.getMeshUnderPointer(controller.uniqueId);
                                }
                                if (mesh === ground) {
                                    return;
                                }
                                const group = Object.keys(groupMeshes).find(group =>
                                    groupMeshes[group].parentNode === mesh ||
                                    groupMeshes[group].LineSystem === mesh ||
                                    groupMeshes[group].ribbon === mesh
                                );
                                if (group) {
                                    pickedMesh = groupMeshes[group].parentNode;
                                    originalParent = pickedMesh.parent;
                                    pickedMesh.setParent(motionController.rootMesh);
                                }
                            }
                        } else {
                            if (pickedMesh) {
                                pickedMesh.setParent(originalParent);
                                pickedMesh = null;
                            }
                        }
                    }
                });

                squeezeComponent.onButtonStateChangedObservable.add(() => {
                    if (squeezeComponent.changes.pressed) {
                        if (squeezeComponent.pressed) {
                            if (leftController && rightController && pickedMesh) {
                                startScaling();
                            }
                        } else {
                            stopScaling();
                        }
                    }
                });
            });
        });

        function startScaling() {
            if (leftController && rightController && pickedMesh) {
                const leftPosition = leftController.grip.position;
                const rightPosition = rightController.grip.position;
                initialDistance = BABYLON.Vector3.Distance(leftPosition, rightPosition);
                initialScale = pickedMesh.scaling.clone();
                isScaling = true;
            }
        }

        function stopScaling() {
            isScaling = false;
            initialDistance = null;
            initialScale = null;
        }

        scene.onBeforeRenderObservable.add(() => {
            if (isScaling && leftController && rightController && pickedMesh) {
                const leftPosition = leftController.grip.position;
                const rightPosition = rightController.grip.position;
                const currentDistance = BABYLON.Vector3.Distance(leftPosition, rightPosition);
                
                if (initialDistance && initialScale) {
                    const scaleFactor = currentDistance / initialDistance;
                    pickedMesh.scaling = initialScale.multiply(new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor));
                }
            }
        });
    });

    engine.runRenderLoop(function() {
        scene.render();
    });

    window.addEventListener("resize", function() {
        engine.resize();
    });
}

// Call the async function to initialize the scene
initializeScene();