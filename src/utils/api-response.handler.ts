import { Response } from 'express';

/**
 * @enum HttpStatusCode
 */
export enum HttpStatusCode {
  SUCCESS = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHENTICATED = 401,
  UNAUTHORIZED = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  SERVER_ERROR = 500,
}

/**
 * @class ApiResponseHandler
 */
export class ApiResponseHandler {
  /**
   * @method send
   * @static
   * @param {Response} res Express response object
   * @param {HttpStatusCode} statusCode Response status code
   * @param {object} [data] Response data
   * @param {string} [message] Optional response message
   * @memberOf ApiResponseHandler
   */
  static send(res: Response, statusCode: HttpStatusCode, data?: object, message?: string) {
    return res.status(statusCode).json(data || { message });
  }

  /**
   * @method ok
   * @static
   * @param {Response} res Express response object
   * @param {object} [data] Response data
   * @param {string} [message] Optional response message
   * @memberOf ApiResponseHandler
   */
  static ok(res: Response, data?: object, message?: string) {
    return ApiResponseHandler.send(res, HttpStatusCode.SUCCESS, data, message);
  }

  /**
   * @method created
   * @static
   * @param {Response} res Express response object
   * @param {object} [data] Response data
   * @param {string} [message] Optional response message
   * @memberOf ResponseHandler
   */
  static created(res: Response, data?: object, message?: string) {
    return ApiResponseHandler.send(res, HttpStatusCode.CREATED, data, message);
  }
}
