const windowWidth = 400;
const windowCenter = 40;

const lower = windowCenter - windowWidth / 2.0;
const upper = windowCenter + windowWidth / 2.0;

const ctVoiRange = { lower, upper };

export default function setBlueColorTransferFunctionForVolumeActor({ volumeActor }) {
  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0);

  // Set the intensity mapping range
  rgbTransferFunction.setMappingRange(lower, upper);

  // Define the blue-scale color mapping:
  // Intensity = `lower` -> Black (0, 0, 0)
  // Intensity = `upper` -> Blue (0, 0, 1)

  rgbTransferFunction.removeAllPoints(); // Clear previous points

  // Add control points for the color map
  rgbTransferFunction.addRGBPoint(lower, 0.0, 0.0, 0.0);  // Black for lowest intensity
  rgbTransferFunction.addRGBPoint(upper, 0.0, 0.0, 1.0);  // Blue for highest intensity
}

export { ctVoiRange };
