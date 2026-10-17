import { BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { User } from './user.model';

@Table({ tableName: 'password_reset_tokens', underscored: true })
export class PasswordResetToken extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare userId: string;

  @Column(DataType.CHAR(64))
  declare tokenHash: string;

  @Column(DataType.DATE(3))
  declare expiresAt: Date;

  @Column(DataType.DATE(3))
  declare usedAt: Date | null;

  @BelongsTo(() => User)
  declare user?: User;

  declare createdAt: Date;
  declare updatedAt: Date;
}
