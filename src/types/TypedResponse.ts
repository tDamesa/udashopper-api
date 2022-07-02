import { Send } from 'express-serve-static-core';

export interface TypedResponse<TResponse> extends Express.Response {
  json: Send<TResponse | { error: string }, this>;
  status: (code: number) => this;
}
