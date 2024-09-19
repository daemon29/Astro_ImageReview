import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

export default function setBlueColorWithOpacityForVolumeActor(volumeActor) {
  // Create the color transfer function (blue scale)
  const cfun = vtkColorTransferFunction.newInstance();

  // Set the mapping range for the intensity values (adjust these values as needed)
  const lower = -1000;  // Hounsfield unit for air (example)
  const upper = 1000;   // Hounsfield unit for soft tissue (example)

  cfun.setMappingRange(lower, upper);

  // Map intensities to blue scale
  cfun.addRGBPoint(lower, 0.0, 0.0, 0.0); // Black at the lowest intensity
  cfun.addRGBPoint((lower + upper) / 2, 0.0, 0.0, 0.5); // Mid-intensity is light blue
  cfun.addRGBPoint(upper, 0.0, 0.0, 1.0); // Blue at the highest intensity

  // Apply the color transfer function to the volume
  volumeActor.getProperty().setRGBTransferFunction(0, cfun);

  // Create the opacity transfer function (adjust transparency)
  const ofun = vtkPiecewiseFunction.newInstance();

  // Map opacity based on intensity
  ofun.addPoint(lower, 0.0); // Fully transparent for lower intensities
  ofun.addPoint((lower + upper) / 2, 0.5); // Semi-transparent for mid-range intensities
  ofun.addPoint(upper, 1.0); // Fully opaque for higher intensities

  // Apply the opacity transfer function to the volume
  volumeActor.getProperty().setScalarOpacity(0, ofun);
}
