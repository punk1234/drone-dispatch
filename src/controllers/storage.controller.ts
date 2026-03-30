import { Request, Response, NextFunction } from 'express';
import { generatePresignedUploadUrl } from '../utils/s3';
import { Controller } from '../decorators';

@Controller()
export class StorageController {
  /**
   * POST /api/storage/upload-url?type=medication
   *
   * Returns a pre-signed S3 PUT URL valid for 5 minutes.
   * The client uploads the image directly to S3 using this URL,
   * then passes the returned imageUrl to the relevant resource endpoint.
   */
  async getUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { extension, mimeType } = req.body;
    const result = await generatePresignedUploadUrl(extension, mimeType);

    res.json({
      message: "Pre-signed upload URL",
      data: {
        uploadUrl: result.uploadUrl, // PUT image bytes here directly from client
        imageUrl: result.imageUrl, // pass this back to POST /api/medications
        expiresIn: result.expiresIn,
        expiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
      },
    });
  }
}

export const storageController = new StorageController();
