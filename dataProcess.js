
async function initializeScene() {
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);

    var camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(-60, 10, 45), scene);
    camera.setTarget(new BABYLON.Vector3(0, 0, 45));
    camera.attachControl(canvas, true);

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
    const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
    ground.material = groundMaterial;
    ground.position = new BABYLON.Vector3(0, 0, 45);

    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 10, 0), scene);

    const xrHelper = await scene.createDefaultXRExperienceAsync({
        floorMeshes: [ground]
    });

    let leftController, rightController;
    let initialDistance = null;
    let initialScale = null;
    let isScaling = false;
    let pickedMesh = null;
    let originalParent = null;
    const groupMeshes = {};

    // Create the 3D UI manager
    const manager = new BABYLON.GUI.GUI3DManager(scene);

    // Create plane panel
    const panel = new BABYLON.GUI.PlanePanel();
    panel.margin = 0.02;
    manager.addControl(panel);

    // Set panel dimensions
    panel.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3);

    // Create an anchor for the panel
    const anchor = new BABYLON.TransformNode("panelAnchor");
    panel.linkToTransformNode(anchor);

    document.getElementById("csvFileInput").addEventListener("change", async function(event) {
        df = await dfd.readCSV(event.target.files[0]);
        document.getElementById("csvFileInput").style.display = 'none';
        canvas.style.display = 'block';

        const wormName = "city_name";
        const TimeAttribute = "time_int";
        const Groups = df[wormName].unique().values;
        const Attribute1 = "tmin";
        const Attribute2 = "tmax";

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
                    [points[i][0], points[i][4]],
                    [points[i][1], points[i][5]],
                    [points[i][2], points[i][6]],
                    [points[i][3], points[i][7]]
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

            const parentNode = new BABYLON.TransformNode(`parent_${group}`, scene);
            LineSystem.parent = parentNode;
            ribbon.parent = parentNode;
            groupMeshes[group] = { parentNode, LineSystem, ribbon };
        }

        function getRandomColor() {
            return new BABYLON.Color3(
                Math.random(),
                Math.random(),
                Math.random()
            );
        }

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

        // Add buttons to the panel
        const addButton = function(group, color) {
            const button = new BABYLON.GUI.HolographicButton("button_" + group);
            button.width = "0.15";
            button.height = "0.15";
            panel.addControl(button);
            button.text = group;
            const buttonMaterial = new BABYLON.StandardMaterial("buttonColor_" + group, scene);
            buttonMaterial.diffuseColor = color;
            button.mesh.material = buttonMaterial;
            button.onPointerUpObservable.add(() => {
                toggleVisibility(group);
            });
        }

        Groups.forEach(group => {
            addButton(group, colors[group]);
        });

        // Function to update panel position
        const updatePanelPosition = () => {
            const xrCamera = xrHelper.baseExperience.camera;
            const forward = xrCamera.getDirection(BABYLON.Vector3.Forward());
            anchor.position = xrCamera.position.add(forward.scale(2));
            anchor.lookAt(xrCamera.position, 0, Math.PI, Math.PI);
        };

        // Toggle panel visibility and interactivity
        let isPanelVisible = true;
        updatePanelPosition();



        xrHelper.input.onControllerAddedObservable.add((controller) => {
            controller.onMotionControllerInitObservable.add((motionController) => {
                const xr_ids = motionController.getComponentIds();
                let triggerComponent = motionController.getComponent(xr_ids[0]);
                let squeezeComponent = motionController.getComponent(xr_ids[1]);

                if (motionController.handness === 'left') {
                    leftController = controller;
                    squeezeComponent.onButtonStateChangedObservable.add(() => {
                        if (squeezeComponent.changes.pressed) {
                            if (squeezeComponent.pressed) {
                                isPanelVisible = !isPanelVisible;
                                if (isPanelVisible) {
                                    updatePanelPosition();
                                }
                                panel.isVisible = isPanelVisible;
                                panel.children.forEach(button => {
                                    button.isVisible = isPanelVisible;
                                    button.isPickable = isPanelVisible;
                                });
                            }
                        }
                    });
                } else if (motionController.handness === 'right') {
                    rightController = controller;
                    triggerComponent.onButtonStateChangedObservable.add(() => {
                        if (triggerComponent.changes.pressed) {
                            if (triggerComponent.pressed) {
                                if (!isPanelVisible) {
                                    const ray = controller.getWorldPointerRayToRef(new BABYLON.Ray());
                                    const hit = scene.pickWithRay(ray);
                                    if (hit.pickedMesh && hit.pickedMesh.parent instanceof BABYLON.GUI.HolographicButton) {
                                        const button = hit.pickedMesh.parent;
                                        console.log("Button selected:", button.text);
                                        toggleVisibility(button.text);
                                    }
                                } else {
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
                }

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

initializeScene();


