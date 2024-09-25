async function initializeScene() {
    // Create the engine and the scene
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);

    // Create a UniversalCamera
    var camera = new BABYLON.UniversalCamera("camera1", new BABYLON.Vector3(-60, 10, 45), scene);
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

    document.getElementById("csvFileInput").addEventListener("change", async function(event) {
        df = await dfd.readCSV(event.target.files[0]);
        document.getElementById("csvFileInput").style.display = 'none';
        canvas.style.display = 'block';
        const Groups = df["Group"].unique().values;
        const Attribute1 = "Daphnia_Large";
        const Attribute2 = "Daphnia_Small";

        let allBoxPlotValues = [];

        for (let Group of Groups) {
            let filteredDf = df.loc({ rows: df["Group"].eq(Group), columns: ["Time", Attribute1, Attribute2] });
            let groupedDf = filteredDf.groupby(["Time"]);
            let Attrnames = [Attribute1, Attribute2];
            let intermediate = {};
            let [min, Q1, median, Q3, IQR, max] = [[], [], [], [], [], []];
            let boxPLotvalues = [];

            for (let timeStamp of filteredDf["Time"].unique().values) {
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

        const groupMeshes = {};
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
            //ribbonMaterial.emissiveColor = color; // Make the ribbon emissive
            //ribbonMaterial.emissiveIntensity = 0.2;
            ribbonMaterial.backFaceCulling = false;
            ribbon.material = ribbonMaterial;

            // Create a parent TransformNode
            const parentNode = new BABYLON.TransformNode(`parent_${group}`, scene);
            LineSystem.parent = parentNode;
            ribbon.parent = parentNode;

            groupMeshes[group] = { parentNode, LineSystem, ribbon };
        }

        const colors = {
            "Control": new BABYLON.Color3(1, 0, 0), // Red
            "High Dose": new BABYLON.Color3(0, 1, 0), // Green
            "Low Dose": new BABYLON.Color3(0, 0, 1) // Blue
        };

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

        window.addEventListener("keydown", function(event) {
            if (event.key === "1") {
                toggleVisibility("Control");
            } else if (event.key === "2") {
                toggleVisibility("Low Dose");
            } else if (event.key === "3") {
                toggleVisibility("High Dose");
            }
        });

        let mesh;

        xrHelper.input.onControllerAddedObservable.add((controller) => {
            controller.onMotionControllerInitObservable.add((motionController) => {
                if (motionController.handness === 'left') {
                    const xr_ids = motionController.getComponentIds();
                    let triggerComponent = motionController.getComponent(xr_ids[0]); // xr-standard-trigger
                    triggerComponent.onButtonStateChangedObservable.add(() => {
                        if (triggerComponent.changes.pressed) {
                            // is it pressed?
                            if (triggerComponent.pressed) {
                                let mesh = scene.meshUnderPointer;
                                console.log(mesh && mesh.name);
                                if (xrHelper.pointerSelection.getMeshUnderPointer) {
                                    mesh = xrHelper.pointerSelection.getMeshUnderPointer(controller.uniqueId);
                                }
                                console.log(mesh && mesh.name);
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
                            } else {
                                if (pickedMesh) {
                                    pickedMesh.setParent(originalParent);
                                    pickedMesh = null;
                                }
                            }
                        }
                    });
                }
            });
        });
        //scene.debugLayer.show();
        engine.runRenderLoop(function() {
            scene.render();
        });
        window.addEventListener("resize", function() {
            engine.resize();
        });
    });
   
}

// Call the async function to initialize the scene
initializeScene();