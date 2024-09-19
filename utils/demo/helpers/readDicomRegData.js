import { api } from 'dicomweb-client';
import dcmjs from 'dcmjs';
import dicomParser from '../../../../packages/dicomImageLoader/src/externalModules';
const { DicomMetaDictionary } = dcmjs.data;
import { mat4 } from 'gl-matrix';

export default async function readDicomRegData({
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID = null,
  wadoRsRoot,
  client = null,
  convertMultiframe = true,
}) {
  const studySearchOptions = {
    studyInstanceUID: StudyInstanceUID,
    seriesInstanceUID: SeriesInstanceUID,
  };
  const MODALITY = '00080060';
  const REGISTRATION_SEQUENCE = "00700308";
  const MATRIX_REGISTRATION_SEQUENCE = "00700309";
  const MATRIX_SEQUENCE = "0070030A";
  const MATRIXUID = "300600C6";
  client = client || new api.DICOMwebClient({ url: wadoRsRoot });
  let instances = await client.retrieveSeriesMetadata(studySearchOptions);
  const modality = instances[0][MODALITY].Value[0];
  if(modality=='REG'){
    var matrix = instances[0]
    [REGISTRATION_SEQUENCE].Value[0]
    [MATRIX_REGISTRATION_SEQUENCE].Value[0]
    [MATRIX_SEQUENCE].Value[0]
    [MATRIXUID].Value;
    return mat4.fromValues(...matrix);
  }
  return mat4.create();
}
