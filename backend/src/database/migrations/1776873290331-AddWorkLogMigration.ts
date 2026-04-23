import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkLogMigration1776873290331 implements MigrationInterface {
    name = 'AddWorkLogMigration1776873290331'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "record" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "payload" jsonb NOT NULL, "parentId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5cb1f4d1aff275cf9001f4343b9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "record" ADD CONSTRAINT "FK_00b383601a567710e1adf6b4a57" FOREIGN KEY ("parentId") REFERENCES "record"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "record" DROP CONSTRAINT "FK_00b383601a567710e1adf6b4a57"`);
        await queryRunner.query(`DROP TABLE "record"`);
    }

}
