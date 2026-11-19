"""Pinhole cameras in the OpenCV convention (x right, y down, z forward).

A camera maps a world point X to pixel coordinates by
    x_cam = R @ X + t,   (u, v) = (fx * x/z + cx, fy * y/z + cy).
Blender's camera looks down -Z with +Y up; `from_blender_matrix` converts.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .workspace import read_json, write_json

FLIP = np.diag([1.0, -1.0, -1.0])


@dataclass
class Camera:
    name: str
    width: int
    height: int
    K: np.ndarray  # 3x3
    R: np.ndarray  # 3x3 world -> camera
    t: np.ndarray  # 3
    ortho: bool = False  # orthographic: K[0,0], K[1,1] are pixels per world unit

    @property
    def center(self) -> np.ndarray:
        return -self.R.T @ self.t

    @property
    def P(self) -> np.ndarray:
        return self.K @ np.hstack([self.R, self.t[:, None]])

    def project(self, X: np.ndarray):
        """World points (N,3) -> pixel coords (N,2) and depth (N,)."""
        Xc = X @ self.R.T + self.t
        z = Xc[:, 2]
        if self.ortho:
            return np.stack([self.K[0, 0] * Xc[:, 0] + self.K[0, 2], self.K[1, 1] * Xc[:, 1] + self.K[1, 2]], 1), z
        with np.errstate(divide="ignore", invalid="ignore"):
            u = self.K[0, 0] * Xc[:, 0] / z + self.K[0, 2]
            v = self.K[1, 1] * Xc[:, 1] / z + self.K[1, 2]
        return np.stack([u, v], 1), z

    def to_json(self) -> dict:
        return {"name": self.name, "width": self.width, "height": self.height, "K": self.K.tolist(), "R": self.R.tolist(), "t": self.t.tolist(), "ortho": self.ortho}

    @classmethod
    def from_json(cls, d: dict) -> "Camera":
        return cls(d["name"], int(d["width"]), int(d["height"]), np.array(d["K"], float), np.array(d["R"], float), np.array(d["t"], float), bool(d.get("ortho", False)))

    @classmethod
    def from_blender_matrix(cls, name, width, height, f_mm, sensor_w_mm, matrix_world) -> "Camera":
        M = np.array(matrix_world, float)
        Rbw = M[:3, :3] / np.linalg.norm(M[:3, :3], axis=0)  # camera->world rotation (Blender axes)
        C = M[:3, 3]
        R = FLIP @ Rbw.T
        t = -R @ C
        fx = f_mm / sensor_w_mm * width
        K = np.array([[fx, 0, width / 2.0], [0, fx, height / 2.0], [0, 0, 1]])
        return cls(name, width, height, K, R, t)

    def view_dirs(self, X: np.ndarray) -> np.ndarray:
        """Unit vectors from world points towards the camera."""
        if self.ortho:
            return np.broadcast_to(-self.R[2], X.shape).copy()
        d = self.center - X
        return d / np.linalg.norm(d, axis=1, keepdims=True)

    def blender_matrix(self) -> np.ndarray:
        """4x4 camera->world matrix in Blender's camera convention."""
        Rbw = (FLIP @ self.R).T
        M = np.eye(4)
        M[:3, :3] = Rbw
        M[:3, 3] = self.center
        return M


def save_cameras(path: Path, cams, extra: dict | None = None) -> None:
    write_json(path, {"convention": "opencv world->camera", **(extra or {}), "cameras": [c.to_json() for c in cams]})


def load_cameras(path: Path):
    return [Camera.from_json(d) for d in read_json(path)["cameras"]]


def umeyama(src: np.ndarray, dst: np.ndarray):
    """Similarity (s, R, t) minimising |dst - (s R src + t)|^2."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    cov = xd.T @ xs / len(src)
    U, D, Vt = np.linalg.svd(cov)
    S = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        S[2, 2] = -1
    R = U @ S @ Vt
    var = (xs ** 2).sum() / len(src)
    s = np.trace(np.diag(D) @ S) / var
    t = mu_d - s * R @ mu_s
    return s, R, t


def rotation_angle_deg(Ra: np.ndarray, Rb: np.ndarray) -> float:
    c = (np.trace(Ra.T @ Rb) - 1) / 2
    return float(np.degrees(np.arccos(np.clip(c, -1, 1))))
