import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
  Viewport,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  //setTitleAndDescription,
  setPetColorMapTransferFunctionForVolumeActor,
  //setPetTransferFunctionForVolumeActor,
  setCtTransferFunctionForVolumeActor,
  setBlueColorTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  //addButtonToToolbar,
  addSliderToToolbar,
  readDicomRegData,
} from '../../../../utils/demo/helpers';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {setBlueColorWithOpacityForVolumeActor} from '../../../../utils/pantherutils'
import { setOptions } from '../../../dicomImageLoader/src/imageLoader/internal/options';
import getViewportImageIds from '../../../core/src/utilities/getViewportImageIds';
import { mat4 } from 'gl-matrix';

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  synchronizers,
  MIPJumpToClickTool,
  VolumeRotateMouseWheelTool,
  CrosshairsTool,
  TrackballRotateTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, BlendModes } = Enums;

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

let renderingEngine;
const wadoRsRoot = 'http://127.0.0.1:800/dicom-web';
const renderingEngineId = 'myRenderingEngine';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;
const ctToolGroupId = 'CT_TOOLGROUP_ID';
const ptToolGroupId = 'PT_TOOLGROUP_ID';
const fusionToolGroupId = 'FUSION_TOOLGROUP_ID';
const mipToolGroupUID = 'MIP_TOOLGROUP_ID';
let ctImageIds;
let ptImageIds;
let ctVolume;
let ptVolume;
let registrationMatrix = mat4.create();
const axialCameraSynchronizerId = 'AXIAL_CAMERA_SYNCHRONIZER_ID';
const sagittalCameraSynchronizerId = 'SAGITTAL_CAMERA_SYNCHRONIZER_ID';
const coronalCameraSynchronizerId = 'CORONAL_CAMERA_SYNCHRONIZER_ID';
const ctVoiSynchronizerId = 'CT_VOI_SYNCHRONIZER_ID';
const ptVoiSynchronizerId = 'PT_VOI_SYNCHRONIZER_ID';
const fusionVoiSynchronizerId = 'FUSION_VOI_SYNCHRONIZER_ID';
let axialCameraPositionSynchronizer;
let sagittalCameraPositionSynchronizer;
let coronalCameraPositionSynchronizer;
let ctVoiSynchronizer;
let ptVoiSynchronizer;
let fusionVoiSynchronizer;
const viewportIds = {
  CT: { AXIAL: 'CT1_AXIAL', SAGITTAL: 'CT1_SAGITTAL', CORONAL: 'CT1_CORONAL' },
  PT: { AXIAL: 'CT2_AXIAL', SAGITTAL: 'CT2_SAGITTAL', CORONAL: 'CT2_CORONAL' },
  FUSION: {
    AXIAL: 'FUSION_AXIAL',
    SAGITTAL: 'FUSION_SAGITTAL',
    CORONAL: 'FUSION_CORONAL',
  },
  PETMIP: {
    CORONAL: 'PET_MIP_CORONAL',
  },
};

let opacity = 0;



const optionsValues = [WindowLevelTool.toolName, CrosshairsTool.toolName];
let expandedElement = null; // To track which element is expanded

function toggleViewportSize(element: HTMLElement) {
  if(expandedElement==element){
    element.style.gridColumn = '';
    element.style.gridRow = '';
    element.style.gridColumn = element.dataset.originalGridColumnStart || '';
    element.style.gridRow = element.dataset.originalGridRowStart || '';
    element.style.zIndex = '';  // Reset z-index
    expandedElement = null;
  }else{
    if (expandedElement) {
      expandedElement.style.gridColumn = '';
      expandedElement.style.gridRow = '';
      expandedElement.style.zIndex = '';  // Reset z-index
    }
    if (!element.dataset.originalGridColumn) {
      element.dataset.originalGridColumnStart = element.style.gridColumnStart;
      element.dataset.originalGridRowStart = element.style.gridRowStart;
    }
    // Expand the clicked element to span all rows and columns
    element.style.gridColumn = '1 / 4';  // Span all 3 columns
    element.style.gridRow = '1 / 4';  // Span all 3 rows
    element.style.zIndex = '1000';  // Bring the element to the front
    element.style.width = '100%';  // Ensure it takes full width
    element.style.height = '100%';
    expandedElement = element;
  }
  const renderEngine = getRenderingEngine(renderingEngineId);
  renderEngine.resize(true);
}

addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: WindowLevelTool.toolName },
  onSelectedValueChange: (toolNameAsStringOrNumber) => {
    const toolName = String(toolNameAsStringOrNumber);

    [ctToolGroupId, ptToolGroupId, fusionToolGroupId].forEach((toolGroupId) => {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      // Set the other tools disabled so we don't get conflicts.
      // Note we only strictly need to change the one which is currently active.

      if (toolName === WindowLevelTool.toolName) {
        // Set crosshairs passive so they are still interactable
        toolGroup.setToolPassive(CrosshairsTool.toolName);
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        });
      } else {
        toolGroup.setToolDisabled(WindowLevelTool.toolName);
        toolGroup.setToolActive(CrosshairsTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        });
      }
    });
  },
});

const resizeObserver = new ResizeObserver(() => {
  renderingEngine = getRenderingEngine(renderingEngineId);
  if (renderingEngine) {
    renderingEngine.resize(true, false);
  }
});
document.getElementById("demo-title-container").remove();
document.getElementById("demo-description-container").remove();

const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateRows = '1fr 1fr 1fr'; // Divide the grid into 3 equal rows
viewportGrid.style.gridTemplateColumns = '1fr 1fr 1fr'; // Divide the grid into 3 equal columns
viewportGrid.style.width = '98vw';
viewportGrid.style.height = '95vh';
viewportGrid.style.gap = '8px';

const content = document.getElementById('content');
const element1_1 = document.createElement('div');
const element1_2 = document.createElement('div');
const element1_3 = document.createElement('div');
const element2_1 = document.createElement('div');
const element2_2 = document.createElement('div');
const element2_3 = document.createElement('div');
const element3_1 = document.createElement('div');
const element3_2 = document.createElement('div');
const element3_3 = document.createElement('div');
// Place main 3x3 viewports
element1_1.style.gridColumnStart = '1';
element1_1.style.gridRowStart = '1';
element1_2.style.gridColumnStart = '2';
element1_2.style.gridRowStart = '1';
element1_3.style.gridColumnStart = '3';
element1_3.style.gridRowStart = '1';
element2_1.style.gridColumnStart = '1';
element2_1.style.gridRowStart = '2';
element2_2.style.gridColumnStart = '2';
element2_2.style.gridRowStart = '2';
element2_3.style.gridColumnStart = '3';
element2_3.style.gridRowStart = '2';
element3_1.style.gridColumnStart = '1';
element3_1.style.gridRowStart = '3';
element3_2.style.gridColumnStart = '2';
element3_2.style.gridRowStart = '3';
element3_3.style.gridColumnStart = '3';
element3_3.style.gridRowStart = '3';
const elements = [
  element1_1,
  element1_2,
  element1_3,
  element2_1,
  element2_2,
  element2_3,
  element3_1,
  element3_2,
  element3_3,
];

for(let elementIndex = 0; elementIndex<elements.length; elementIndex++){
  const element = elements[elementIndex];

  element.id = `viewport${elementIndex}`;
  element.style.width = '100%';
  element.style.height = '100%';
  element.style.border = '3px solid #6687d9'; // Add border to the entire grid
  element.style.borderRadius = '10px'; // Make the corners rounded (10px radius)
  //element.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)'; // Add shadow (adjust values for desired effect)

  element.oncontextmenu = (e) => e.preventDefault();
  element.ondblclick = () => toggleViewportSize(element);

  viewportGrid.appendChild(element);
}
content.appendChild(viewportGrid);

const viewportColors = {
  [viewportIds.CT.AXIAL]: 'rgb(200, 0, 0)',
  [viewportIds.CT.SAGITTAL]: 'rgb(200, 200, 0)',
  [viewportIds.CT.CORONAL]: 'rgb(0, 200, 0)',
  [viewportIds.PT.AXIAL]: 'rgb(200, 0, 0)',
  [viewportIds.PT.SAGITTAL]: 'rgb(200, 200, 0)',
  [viewportIds.PT.CORONAL]: 'rgb(0, 200, 0)',
  [viewportIds.FUSION.AXIAL]: 'rgb(200, 0, 0)',
  [viewportIds.FUSION.SAGITTAL]: 'rgb(200, 200, 0)',
  [viewportIds.FUSION.CORONAL]: 'rgb(0, 200, 0)',
};

const viewportReferenceLineControllable = [
  viewportIds.CT.AXIAL,
  viewportIds.CT.SAGITTAL,
  viewportIds.CT.CORONAL,
  viewportIds.PT.AXIAL,
  viewportIds.PT.SAGITTAL,
  viewportIds.PT.CORONAL,
  viewportIds.FUSION.AXIAL,
  viewportIds.FUSION.SAGITTAL,
  viewportIds.FUSION.CORONAL,
];

const viewportReferenceLineDraggableRotatable = [
  viewportIds.CT.AXIAL,
  viewportIds.CT.SAGITTAL,
  viewportIds.CT.CORONAL,
  viewportIds.PT.AXIAL,
  viewportIds.PT.SAGITTAL,
  viewportIds.PT.CORONAL,
  viewportIds.FUSION.AXIAL,
  viewportIds.FUSION.SAGITTAL,
  viewportIds.FUSION.CORONAL,
];

const viewportReferenceLineSlabThicknessControlsOn = [
  viewportIds.CT.AXIAL,
  viewportIds.CT.SAGITTAL,
  viewportIds.CT.CORONAL,
  viewportIds.PT.AXIAL,
  viewportIds.PT.SAGITTAL,
  viewportIds.PT.CORONAL,
  viewportIds.FUSION.AXIAL,
  viewportIds.FUSION.SAGITTAL,
  viewportIds.FUSION.CORONAL,
];

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable(viewportId) {
  const index = viewportReferenceLineControllable.indexOf(viewportId);
  return index !== -1;
}

function getReferenceLineDraggableRotatable(viewportId) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportId);
  return index !== -1;
}

function getReferenceLineSlabThicknessControlsOn(viewportId) {
  const index =
    viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId);
  return index !== -1;
}

function setUpToolGroups() {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(MIPJumpToClickTool);
  cornerstoneTools.addTool(VolumeRotateMouseWheelTool);
  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  // Define tool groups for the main 9 viewports.
  // Crosshairs currently only supports 3 viewports for a toolgroup due to the
  // way it is constructed, but its configuration input allows us to synchronize
  // multiple sets of 3 viewports.
  const ctToolGroup = ToolGroupManager.createToolGroup(ctToolGroupId);
  const ptToolGroup = ToolGroupManager.createToolGroup(ptToolGroupId);
  const fusionToolGroup = ToolGroupManager.createToolGroup(fusionToolGroupId);

  ctToolGroup.addViewport(viewportIds.CT.AXIAL, renderingEngineId);
  ctToolGroup.addViewport(viewportIds.CT.SAGITTAL, renderingEngineId);
  ctToolGroup.addViewport(viewportIds.CT.CORONAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.AXIAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.SAGITTAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.CORONAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.AXIAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.SAGITTAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.CORONAL, renderingEngineId);

  // Manipulation Tools
  [ctToolGroup, ptToolGroup].forEach((toolGroup) => {
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
    toolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    });
  });

  fusionToolGroup.addTool(PanTool.toolName);
  fusionToolGroup.addTool(ZoomTool.toolName);
  fusionToolGroup.addTool(StackScrollMouseWheelTool.toolName);
  fusionToolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
    // Only set CT volume to MIP in the fusion viewport
    filterActorUIDsToSetSlabThickness: [ctVolumeId],
  });

  // Here is the difference in the toolGroups used, that we need to specify the
  // volume to use for the WindowLevelTool for the fusion viewports
  ctToolGroup.addTool(WindowLevelTool.toolName);
  ptToolGroup.addTool(WindowLevelTool.toolName);
  fusionToolGroup.addTool(WindowLevelTool.toolName);

  [ctToolGroup, ptToolGroup, fusionToolGroup].forEach((toolGroup) => {
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary, // Middle Click
        },
      ],
    });
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary, // Right Click
        },
      ],
    });

    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolPassive(CrosshairsTool.toolName);
  });
}

function setUpSynchronizers() {
  axialCameraPositionSynchronizer = createCameraPositionSynchronizer(
    axialCameraSynchronizerId
  );
  sagittalCameraPositionSynchronizer = createCameraPositionSynchronizer(
    sagittalCameraSynchronizerId
  );
  coronalCameraPositionSynchronizer = createCameraPositionSynchronizer(
    coronalCameraSynchronizerId
  );
  ctVoiSynchronizer = createVOISynchronizer(ctVoiSynchronizerId, {
    syncInvertState: false,
    syncColormap: false,
  });
  ptVoiSynchronizer = createVOISynchronizer(ptVoiSynchronizerId, {
    syncInvertState: false,
    syncColormap: false,
  });
  fusionVoiSynchronizer = createVOISynchronizer(fusionVoiSynchronizerId, {
    syncInvertState: false,
    syncColormap: false,
  });
  // Add viewports to camera synchronizers
  [
    viewportIds.CT.AXIAL,
    viewportIds.PT.AXIAL,
    viewportIds.FUSION.AXIAL,
  ].forEach((viewportId) => {
    axialCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.CT.SAGITTAL,
    viewportIds.PT.SAGITTAL,
    viewportIds.FUSION.SAGITTAL,
  ].forEach((viewportId) => {
    sagittalCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.CT.CORONAL,
    viewportIds.PT.CORONAL,
    viewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    coronalCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });

  // Add viewports to VOI synchronizers
  [
    viewportIds.CT.AXIAL,
    viewportIds.CT.SAGITTAL,
    viewportIds.CT.CORONAL,
  ].forEach((viewportId) => {
    ctVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.PT.AXIAL,
    viewportIds.PT.SAGITTAL,
    viewportIds.PT.CORONAL,
  ].forEach((viewportId) => {
    ptVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.FUSION.AXIAL,
    viewportIds.FUSION.SAGITTAL,
    viewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    fusionVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
    ctVoiSynchronizer.addTarget({
      renderingEngineId,
      viewportId,
    });
    ptVoiSynchronizer.addTarget({
      renderingEngineId,
      viewportId,
    });
  });
}

function getCt1ImageIds() {
  return createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.156.112736.1.2.2.1097583607.12296.1695818166.610',
    SeriesInstanceUID:
      '1.2.840.113729.1.4237.9996.2023.9.15.17.48.36.250.10076',
    wadoRsRoot,
  });
}
function getCt2ImageIds() {
  return createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.156.112736.1.2.2.1279709348.4668.1704737711.457',
    SeriesInstanceUID:
      '1.2.156.112736.1.3.2.1279709348.4668.1704737828.462',
    wadoRsRoot,
  });
}
function getCt2RegData(){
  return readDicomRegData({
    StudyInstanceUID: '1.2.156.112736.1.2.2.1279709348.4668.1704737711.457',
    SeriesInstanceUID:
      '1.2.156.112736.1.3.2.1279709348.4668.1704737855.630',
    wadoRsRoot,
  });
}

async function setUpDisplay() {
  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportIds.CT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds.CT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.CT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: viewportIds.PT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds.PT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.PT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: viewportIds.FUSION.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds.FUSION.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.FUSION.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the volumes to load

  ptVolume.load();
  ctVolume.load();
  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ctVolumeId,
        callback: setCtTransferFunctionForVolumeActor,
        matrix: registrationMatrix,
      },
    ],
    [viewportIds.CT.AXIAL, viewportIds.CT.SAGITTAL, viewportIds.CT.CORONAL]
  );

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ptVolumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    [viewportIds.PT.AXIAL, viewportIds.PT.SAGITTAL, viewportIds.PT.CORONAL]
  );
    await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ctVolumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
      {
        volumeId: ptVolumeId,
        callback: setPetColorMapTransferFunctionForVolumeActor,
        matrix: registrationMatrix,
      },
    ],
    [
      viewportIds.FUSION.AXIAL,
      viewportIds.FUSION.SAGITTAL,
      viewportIds.FUSION.CORONAL,
    ]
  );

  initializeCameraSync(renderingEngine);
  renderingEngine.render();
}

addSliderToToolbar({
  title: 'opacity',
  step: 1,
  range: [0, 255],
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    opacity = Number(value) / 255;
    renderingEngine.getViewport(viewportIds.FUSION.AXIAL).setProperties(
      {
        colormap: {
          opacity: opacity,
        },
      },
      ptVolumeId
    );
    renderingEngine.getViewport(viewportIds.FUSION.CORONAL).setProperties(
      {
        colormap: {
          opacity: opacity,
        },
      },
      ptVolumeId
    );
    renderingEngine.getViewport(viewportIds.FUSION.SAGITTAL).setProperties(
      {
        colormap: {
          opacity: opacity,
        },
      },
      ptVolumeId
    );

    renderingEngine.render();
  },
});


function initializeCameraSync(renderingEngine) {
  // The fusion scene is the target as it is scaled to both volumes.
  // TODO -> We should have a more generic way to do this,
  // So that when all data is added we can synchronize zoom/position before interaction.

  const axialCtViewport = renderingEngine.getViewport(viewportIds.CT.AXIAL);
  const sagittalCtViewport = renderingEngine.getViewport(
    viewportIds.CT.SAGITTAL
  );
  const coronalCtViewport = renderingEngine.getViewport(viewportIds.CT.CORONAL);

  const axialPtViewport = renderingEngine.getViewport(viewportIds.PT.AXIAL);
  const sagittalPtViewport = renderingEngine.getViewport(
    viewportIds.PT.SAGITTAL
  );
  const coronalPtViewport = renderingEngine.getViewport(viewportIds.PT.CORONAL);

  const axialFusionViewport = renderingEngine.getViewport(
    viewportIds.FUSION.AXIAL
  );
  const sagittalFusionViewport = renderingEngine.getViewport(
    viewportIds.FUSION.SAGITTAL
  );
  const coronalFusionViewport = renderingEngine.getViewport(
    viewportIds.FUSION.CORONAL
  );

  initCameraSynchronization(axialFusionViewport, axialCtViewport);
  initCameraSynchronization(axialFusionViewport, axialPtViewport);

  initCameraSynchronization(sagittalFusionViewport, sagittalCtViewport);
  initCameraSynchronization(sagittalFusionViewport, sagittalPtViewport);

  initCameraSynchronization(coronalFusionViewport, coronalCtViewport);
  initCameraSynchronization(coronalFusionViewport, coronalPtViewport);

  renderingEngine.render();
}

function initCameraSynchronization(sViewport, tViewport) {
  // Initialise the sync as they viewports will have
  // Different initial zoom levels for viewports of different sizes.

  const camera = sViewport.getCamera();

  tViewport.setCamera(camera);
}


/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);
  // Get Cornerstone imageIds and fetch metadata into RAM
  ctImageIds = await getCt1ImageIds();

  ptImageIds = await getCt2ImageIds();

  // load registrationMatrix
  registrationMatrix = await getCt2RegData();
  // Define a volume in memory
  ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  // Define a volume in memory
  ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Display needs to be set up first so that we have viewport to reference for tools and synchronizers.
  await setUpDisplay();

  // Tools and synchronizers can be set up in any order.
  setUpToolGroups();
  setUpSynchronizers();
}

run();
