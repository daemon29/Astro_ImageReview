import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  utilities,
  geometryLoader,
  CONSTANTS,
  eventTarget,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  downloadSurfacesData,
  addLabelToToolbar,
} from '../../../../utils/demo/helpers';

import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  ZoomTool,
  PanTool,
  StackScrollMouseWheelTool,
  TrackballRotateTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, GeometryType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId3d = 'MY_TOOLGROUP_ID_3d';
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Surface Segmentation Representation for Volume Viewports',
  'This example first downloads the surface data. In this demonstration, we will show you how to render surfaces. There is a 3D viewport. When you interact with the images, the intersection between the surfaces and the underlying volume is calculated. Please note that this calculation may be slow during the initial visit, but we have implemented caching to significantly improve speed in subsequent visits. In the future, we plan to enhance the user experience by introducing off-thread pre-calculation of all surfaces.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element2 = document.createElement('div');
element2.oncontextmenu = () => false;

element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);
let renderingEngine;
const instructions = document.createElement('p');
content.append(instructions);
// ============================= //

// Create the viewports
const viewportId2 = 'CT_3D';

let surfaces;
async function addSegmentationsToState() {
  // Download the surface data. Please note that this is a large file
  // and may take a while to download
  surfaces = await downloadSurfacesData();

  const geometriesInfo = surfaces.reduce(
    (acc: Map<number, string>, surface, index) => {
      const geometryId = surface.closedSurface.id;
      geometryLoader.createAndCacheGeometry(geometryId, {
        type: GeometryType.SURFACE,
        geometryData: surface.closedSurface as Types.PublicSurfaceData,
      });

      const segmentIndex = index + 1;
      acc.set(segmentIndex, geometryId);

      return acc;
    },
    new Map()
  );

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Surface,
        // The actual segmentation data, in the case of contour geometry
        // this is a reference to the geometry data
        data: {
          geometryIds: geometriesInfo,
        },
      },
    },
  ]);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  const toolGroup3d = ToolGroupManager.createToolGroup(toolGroupId3d);

  toolGroup3d.addTool(SegmentationDisplayTool.toolName);
  toolGroup3d.addTool(ZoomTool.toolName);
  toolGroup3d.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });

  toolGroup3d.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup3d.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  toolGroup3d.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup3d.addViewport(viewportId2, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId2]).then(
    () => {
      const viewport3d = renderingEngine.getViewport(viewportId2);
      const volumeActor = viewport3d.getDefaultActor()
        .actor as Types.VolumeActor;
      utilities.applyPreset(
        volumeActor,
        CONSTANTS.VIEWPORT_PRESETS.find(
          (preset) => preset.name === 'CT-Chest-Contrast-Enhanced'
        )
      );

      const renderer = viewport3d.getRenderer();
      renderer.getActiveCamera().elevation(-70);
      viewport3d.setCamera({ parallelScale: 600 });

      viewport3d.render();
    }
  );

  await segmentation.addSegmentationRepresentations(toolGroupId3d, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Surface,
    },
  ]);

  // Render the image
  renderingEngine.render();
}

run();
