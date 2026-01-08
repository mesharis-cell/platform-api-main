import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../config';
import crypto from 'crypto';

// Initialize S3 Client
const s3Client = new S3Client({
    region: config.aws_region,
    credentials: {
        accessKeyId: config.aws_access_key_id!,
        secretAccessKey: config.aws_secret_access_key!,
    },
});

// ------------------------------------ UPLOAD FILE TO S3 ------------------------------------
export const uploadFileToS3 = async (
    file: Buffer,
    folder: string,
    fileName?: string,
    contentType?: string,
    customKey?: string
): Promise<string> => {
    try {
        // Generate unique file name if not provided
        const uniqueFileName = fileName || `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        const key = customKey || `${folder}/${uniqueFileName}`;

        const command = new PutObjectCommand({
            Bucket: config.aws_s3_bucket,
            Key: key,
            Body: file,
            ContentType: contentType || 'application/octet-stream',
        });

        await s3Client.send(command);

        // Return the S3 URL
        const fileUrl = `https://${config.aws_s3_bucket}.s3.${config.aws_region}.amazonaws.com/${key}`;
        return fileUrl;
    } catch (error) {
        console.error('Error uploading file to S3:', error);
        throw new Error('Failed to upload file to S3');
    }
};

// ------------------------------------ DELETE FILE FROM S3 ----------------------------------
export const deleteFileFromS3 = async (fileUrl: string): Promise<void> => {
    try {
        // Extract key from URL
        const url = new URL(fileUrl);
        const key = url.pathname.substring(1); // Remove leading slash

        const command = new DeleteObjectCommand({
            Bucket: config.aws_s3_bucket,
            Key: key,
        });

        await s3Client.send(command);
        console.log(`File deleted successfully: ${key}`);
    } catch (error) {
        console.error('Error deleting file from S3:', error);
        throw new Error('Failed to delete file from S3');
    }
};

// ------------------------------------ GET PRE-SIGNED URL -----------------------------------
// Generate a presigned URL for temporary file access
export const getPresignedUrl = async (
    fileUrl: string,
    expiresIn: number = 3600
): Promise<string> => {
    try {
        // Extract key from URL
        const url = new URL(fileUrl);
        const key = url.pathname.substring(1); // Remove leading slash

        const command = new GetObjectCommand({
            Bucket: config.aws_s3_bucket,
            Key: key,
        });

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
        return presignedUrl;
    } catch (error) {
        console.error('Error generating presigned URL:', error);
        throw new Error('Failed to generate presigned URL');
    }
};

// ------------------------------------ UPLOAD PDF TO S3 -------------------------------------
export const uploadPDFToS3 = async (
    pdfBuffer: Buffer,
    fileName: string,
    key?: string
): Promise<string> => {
    return uploadFileToS3(pdfBuffer, 'invoices', `${fileName}.pdf`, 'application/pdf', key);
};

// ------------------------------------ UPLOAD IMAGE TO S3 -----------------------------------
export const uploadImageToS3 = async (
    imageBuffer: Buffer,
    fileName: string,
    contentType: string
): Promise<string> => {
    return uploadFileToS3(imageBuffer, 'images', fileName, contentType);
};

export const getPDFBufferFromS3 = async (fileUrlOrKey: string): Promise<Buffer> => {
    try {
        // Check if input is a URL using regex
        const urlRegex = /^https?:\/\//i;
        let key: string;

        if (urlRegex.test(fileUrlOrKey)) {
            // Extract key from URL
            const url = new URL(fileUrlOrKey);
            key = url.pathname.substring(1); // Remove leading slash
        } else {
            // Input is already a key
            key = fileUrlOrKey;
        }

        const command = new GetObjectCommand({
            Bucket: config.aws_s3_bucket,
            Key: key,
        });

        const response = await s3Client.send(command);

        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as any) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        return buffer;
    } catch (error) {
        console.error('Error fetching PDF from S3:', error);
        throw new Error('Failed to fetch invoice PDF');
    }
};