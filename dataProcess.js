const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);

// Create a FreeCamera
var camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(10, 10, -10), scene);
camera.setTarget(new BABYLON.Vector3(0, 0, 45));
camera.attachControl(canvas, true);

// Set up camera controls
camera.keysUp.push(87);    // W
camera.keysDown.push(83);  // S
camera.keysLeft.push(65);  // A
camera.keysRight.push(68); // D
camera.keysUpward.push(81);  // Q 
camera.keysDownward.push(69);  // E 

camera.speed = 0.3;
camera.minZ = 1.0;


// Add a floor to the scene
const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
groundMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1); // White color
ground.material = groundMaterial;
ground.position = new BABYLON.Vector3(0, 3, 45); // Slightly below the visualization

const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);

document.getElementById("csvFileInput").addEventListener("change", async function(event) {
    df = await dfd.readCSV(event.target.files[0]);
    document.getElementById("csvFileInput").style.display = 'none';
    canvas.style.display = 'block';
    //const Groups = ["Control", "Low Dose", "High Dose"];
    const Groups  = df["Group"].unique().values;
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
        ribbonMaterial.backFaceCulling = false;
        //ribbonMaterial.emmisiveColor = color;
        ribbon.material = ribbonMaterial;

        groupMeshes[group] = { LineSystem, ribbon };
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
            //meshes.LineSystem.scaling = new BABYLON.Vector3(5, 5, 5);
            //meshes.ribbon.scaling = new BABYLON.Vector(5, 5, 5);
        }
    }
    //toggling visibility of groups
    window.addEventListener("keydown", function(event) {
        const groupIndex = parseInt(event.key) - 1;
        if (groupIndex >= 0 && groupIndex < Groups.length) {
            toggleVisibility(Groups[groupIndex]);
        }
    });
    //scene.debugLayer.show();
    engine.runRenderLoop(function() {
        scene.render();
    });
    window.addEventListener("resize", function() {
        engine.resize();
    });
});
