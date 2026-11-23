import { CollisionFlag } from "../../engine/collision.js";
var infernoPillarCollisionFlags = CollisionFlag.OBJECT | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;
var monsterObstacleCollisionFlags = CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED;
var infernoObstacleCollisionFlags = CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED;
export { infernoPillarCollisionFlags, monsterObstacleCollisionFlags, infernoObstacleCollisionFlags };
