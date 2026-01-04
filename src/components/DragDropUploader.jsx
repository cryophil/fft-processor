import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const DragDropUploader = ({ onFileUpload }) => {
    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles?.length > 0) {
            onFileUpload(acceptedFiles[0]);
        }
    }, [onFileUpload]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/tiff': ['.tif', '.tiff'],
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg']
        },
        multiple: false
    });

    return (
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`} style={dropzoneStyle}>
            <input {...getInputProps()} />
            {
                isDragActive ?
                    <p>Drop the file here ...</p> :
                    <p>Drag 'n' drop a TIFF/Image here, or click to select file</p>
            }
        </div>
    );
};

const dropzoneStyle = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    borderWidth: '2px',
    borderRadius: '2px',
    borderColor: '#666',
    borderStyle: 'dashed',
    backgroundColor: '#222',
    color: '#aaa',
    outline: 'none',
    transition: 'border .24s ease-in-out',
    cursor: 'pointer'
};

export default DragDropUploader;
