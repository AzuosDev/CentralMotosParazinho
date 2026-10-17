import { Types } from 'mongoose';

export interface ICurrentUser {
  _id: Types.ObjectId;
  email: string;
  emailVerified: boolean;
  isAdmin?: boolean;
  bloqueado?: boolean;
}
