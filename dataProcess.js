const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);
var camera = new BABYLON.ArcRotateCamera("camera1", Math.PI / 2, Math.PI / 4, 10, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);

document.getElementById("csvFileInput").addEventListener("change", async function(event) {
    df = await dfd.readCSV(event.target.files[0]);
    document.getElementById("csvFileInput").style.display = 'none';
    canvas.style.display = 'block';
    const Groups = ["Control", "Low Dose", "High Dose"];
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
        let i;

        for (let timeStamp of filteredDf["Time"].unique().values) {
            Attrnames.forEach((Attrname, i) => intermediate[i] = groupedDf.getGroup([timeStamp])[Attrname].values);

            for (i = 0; i < 2; i++) {
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

    function connectPoints(points, scene, color) {
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
            let outerlineSystem = BABYLON.MeshBuilder.CreateLineSystem(`outerlines${i}`, { lines: whiskerLines }, scene);
            let innerLineSystem = BABYLON.MeshBuilder.CreateLineSystem(`innerlines${i}`, { lines: diamondLines }, scene);
            innerLineSystem.color = color;
            outerlineSystem.color = color;
        }
        var paths = diamondLines.map(line => line.flat());
        var ribbon = BABYLON.Mesh.CreateRibbon("ribbon", paths, false, false, 0, scene);
        const ribbonMaterial = new BABYLON.StandardMaterial("ribbonMaterial", scene);
        ribbonMaterial.diffuseColor = color;
        ribbon.material = ribbonMaterial;
    }

    const colors = {
        "Control": new BABYLON.Color3(1, 0, 0), // Red
        "Low Dose": new BABYLON.Color3(0, 1, 0), // Green
        "High Dose": new BABYLON.Color3(0, 0, 1) // Blue
    };

    allBoxPlotValues.forEach(groupData => {
        connectPoints(groupData.values, scene, colors[groupData.group]);
    });

    const axesViewer = new BABYLON.AxesViewer(scene, 60);
    engine.runRenderLoop(function() {
        scene.render();
    });
    window.addEventListener("resize", function() {
        engine.resize();
    });
    //cene.debugLayer.show();
});